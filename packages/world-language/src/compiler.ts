import {
  verifyCapabilityRequirements,
  type CapabilityCatalogSnapshot,
  type CapabilityRequirement,
} from '@mahjongplus/world-capabilities';
import { validateCorePrograms } from '@mahjongplus/world-calculus';
import { stableHash } from './canonical.js';
import type { EffectDefinition, ProcedureDefinition, WorldImage, WorldSource } from './ast.js';

export interface CompileWorldOptions {
  capabilityCatalog?: CapabilityCatalogSnapshot;
}

function uniqueIds(kind: string, values: { id: string }[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.id) throw new Error(`${kind} id is required.`);
    if (seen.has(value.id)) throw new Error(`Duplicate ${kind} id: ${value.id}`);
    seen.add(value.id);
  }
}

function collectCapabilityCalls(value: unknown, output: Array<{ capabilityId: string; version?: string }> = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectCapabilityCalls(entry, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const object = value as Record<string, unknown>;
  if (object.kind === 'capability-call' && typeof object.capabilityId === 'string') {
    output.push({
      capabilityId: object.capabilityId,
      version: typeof object.version === 'string' ? object.version : undefined,
    });
  }
  for (const entry of Object.values(object)) collectCapabilityCalls(entry, output);
  return output;
}

function assertCallsDeclared(source: WorldSource, requirements: CapabilityRequirement[]): void {
  const calls = collectCapabilityCalls(source);
  for (const call of calls) {
    const matches = requirements.filter((requirement) => requirement.id === call.capabilityId);
    if (matches.length === 0) throw new Error(`Capability call ${call.capabilityId} is not declared by the world image.`);
    if (call.version && !matches.some((requirement) => requirement.version === call.version)) {
      throw new Error(`Capability call ${call.capabilityId}@${call.version} is not declared by the world image.`);
    }
    if (!call.version && matches.length !== 1) {
      throw new Error(`Capability call ${call.capabilityId} requires an explicit version.`);
    }
  }
}

function validateEffect(
  effect: EffectDefinition,
  procedures: Map<string, ProcedureDefinition>,
  responseWindows: Set<string>,
): void {
  if (effect.kind === 'procedure.spawn') {
    const procedure = procedures.get(effect.procedureId);
    if (!procedure) throw new Error(`Unknown procedure in spawn effect: ${effect.procedureId}`);
    if (effect.nodeId && !procedure.nodes.some((node) => node.id === effect.nodeId)) {
      throw new Error(`Unknown node ${effect.nodeId} in spawned procedure ${effect.procedureId}.`);
    }
  }
  if (effect.kind === 'zone.distribute') {
    if (effect.batchPattern.length === 0 || effect.batchPattern.some((size) => !Number.isInteger(size) || size < 1)) {
      throw new Error('zone.distribute requires a positive integer batch pattern.');
    }
    if (effect.destinationZones.length === 0) throw new Error('zone.distribute requires destinations.');
  }
  if (effect.kind === 'response-window.open' && !responseWindows.has(effect.definitionId)) {
    throw new Error(`Unknown response window definition: ${effect.definitionId}`);
  }
}

export function compileWorld(source: WorldSource, options: CompileWorldOptions = {}): WorldImage {
  if (!source.schemaVersion) throw new Error('World schema version is required.');
  if (!source.id) throw new Error('World id is required.');
  uniqueIds('entity', source.entities);
  uniqueIds('zone', source.zones);
  uniqueIds('relation', source.relations);
  uniqueIds('action', source.actions);
  uniqueIds('procedure', source.procedures);
  uniqueIds('response window', source.responseWindows ?? []);

  const corePrograms = structuredClone(source.corePrograms ?? {
    constraints: [],
    reducers: [],
    rewrites: [],
  });
  corePrograms.constraints ??= [];
  corePrograms.reducers ??= [];
  corePrograms.rewrites ??= [];
  validateCorePrograms(corePrograms);

  const requirements = structuredClone(source.capabilities ?? []);
  const requirementKeys = new Set<string>();
  for (const requirement of requirements) {
    const key = `${requirement.id}@${requirement.version}`;
    if (requirementKeys.has(key)) throw new Error(`Duplicate capability requirement ${key}.`);
    requirementKeys.add(key);
  }
  assertCallsDeclared(source, requirements);
  if (requirements.length > 0) {
    if (!options.capabilityCatalog) throw new Error('A capability catalog is required to compile this world image.');
    verifyCapabilityRequirements(requirements, options.capabilityCatalog);
  }

  const entityIds = new Set(source.entities.map((entity) => entity.id));
  const zoneIds = new Set(source.zones.map((zone) => zone.id));
  const initiallyPlaced = new Set<string>();
  for (const zone of source.zones) {
    for (const entry of zone.entries) {
      if (!entityIds.has(entry.entityId)) throw new Error(`Zone ${zone.id} references unknown entity ${entry.entityId}.`);
      if ((entry.state ?? 'occupied') === 'occupied') {
        if (initiallyPlaced.has(entry.entityId)) throw new Error(`Entity ${entry.entityId} occupies multiple initial zones.`);
        initiallyPlaced.add(entry.entityId);
      }
    }
  }
  for (const relation of source.relations) {
    const sourceKnown = entityIds.has(relation.source.id) || zoneIds.has(relation.source.id);
    const targetKnown = entityIds.has(relation.target.id) || zoneIds.has(relation.target.id);
    if (!sourceKnown) throw new Error(`Relation ${relation.id} has unknown source ${relation.source.id}.`);
    if (!targetKnown) throw new Error(`Relation ${relation.id} has unknown target ${relation.target.id}.`);
  }

  const procedures = new Map(source.procedures.map((procedure) => [procedure.id, procedure]));
  const responseWindowIds = new Set((source.responseWindows ?? []).map((window) => window.id));
  for (const procedure of source.procedures) {
    uniqueIds(`node in procedure ${procedure.id}`, procedure.nodes);
    const nodes = new Set(procedure.nodes.map((node) => node.id));
    if (!nodes.has(procedure.entryNodeId)) throw new Error(`Procedure ${procedure.id} has an invalid entry node.`);
    for (const node of procedure.nodes) {
      for (const effect of node.onEnter ?? []) validateEffect(effect, procedures, responseWindowIds);
    }
  }

  const actionIds = new Set(source.actions.map((action) => action.id));
  for (const window of source.responseWindows ?? []) {
    for (const actionId of window.allowedActionIds) {
      if (!actionIds.has(actionId)) throw new Error(`Response window ${window.id} references unknown action ${actionId}.`);
    }
    for (const tier of window.tiers) {
      if (tier.actionIds.length === 0) throw new Error(`Response window ${window.id} has an empty priority tier.`);
      for (const actionId of tier.actionIds) {
        if (!window.allowedActionIds.includes(actionId)) {
          throw new Error(`Tier action ${actionId} is not allowed by window ${window.id}.`);
        }
      }
      if (tier.maxSelections != null && (!Number.isInteger(tier.maxSelections) || tier.maxSelections < 1)) {
        throw new Error('maxSelections must be positive.');
      }
    }
    for (const effects of Object.values(window.selectionEffects)) {
      for (const effect of effects) validateEffect(effect, procedures, responseWindowIds);
    }
    for (const effect of window.noSelectionEffects) validateEffect(effect, procedures, responseWindowIds);
  }

  for (const action of source.actions) {
    const procedureRequirements = action.requirements.filter((requirement) => requirement.kind === 'procedure-token');
    if (procedureRequirements.length > 1) throw new Error(`Action ${action.id} has ambiguous procedure token requirements.`);
    for (const requirement of action.requirements) {
      if (requirement.kind === 'procedure-token') {
        const procedure = procedures.get(requirement.procedureId);
        if (!procedure) throw new Error(`Action ${action.id} references unknown procedure ${requirement.procedureId}.`);
        if (!procedure.nodes.some((node) => node.id === requirement.nodeId)) {
          throw new Error(`Action ${action.id} references unknown procedure node ${requirement.nodeId}.`);
        }
      }
    }
    for (const effect of action.effects) validateEffect(effect, procedures, responseWindowIds);
  }
  for (const item of source.bootstrap) {
    if (!procedures.has(item.procedureId)) throw new Error(`Bootstrap references unknown procedure ${item.procedureId}.`);
  }

  const normalized = structuredClone({
    ...source,
    responseWindows: source.responseWindows ?? [],
    corePrograms,
    capabilities: requirements,
  });
  return { ...normalized, hash: stableHash(normalized) };
}
