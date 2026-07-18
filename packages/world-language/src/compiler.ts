import { stableHash } from './canonical.js';
import type { EffectDefinition, ProcedureDefinition, WorldImage, WorldSource } from './ast.js';

function uniqueIds(kind: string, values: { id: string }[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.id) throw new Error(`${kind} id is required.`);
    if (seen.has(value.id)) throw new Error(`Duplicate ${kind} id: ${value.id}`);
    seen.add(value.id);
  }
}

function validateEffect(effect: EffectDefinition, procedures: Map<string, ProcedureDefinition>): void {
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
}

export function compileWorld(source: WorldSource): WorldImage {
  if (!source.schemaVersion) throw new Error('World schema version is required.');
  if (!source.id) throw new Error('World id is required.');
  uniqueIds('entity', source.entities);
  uniqueIds('zone', source.zones);
  uniqueIds('relation', source.relations);
  uniqueIds('action', source.actions);
  uniqueIds('procedure', source.procedures);

  const entityIds = new Set(source.entities.map((entity) => entity.id));
  const zoneIds = new Set(source.zones.map((zone) => zone.id));
  const initiallyPlaced = new Set<string>();
  for (const zone of source.zones) {
    for (const entry of zone.entries) {
      if (!entityIds.has(entry.entityId)) throw new Error(`Zone ${zone.id} references unknown entity ${entry.entityId}.`);
      if (initiallyPlaced.has(entry.entityId)) throw new Error(`Entity ${entry.entityId} occupies multiple initial zones.`);
      initiallyPlaced.add(entry.entityId);
    }
  }
  for (const relation of source.relations) {
    const sourceKnown = entityIds.has(relation.source.id) || zoneIds.has(relation.source.id);
    const targetKnown = entityIds.has(relation.target.id) || zoneIds.has(relation.target.id);
    if (!sourceKnown) throw new Error(`Relation ${relation.id} has unknown source ${relation.source.id}.`);
    if (!targetKnown) throw new Error(`Relation ${relation.id} has unknown target ${relation.target.id}.`);
  }

  const procedures = new Map(source.procedures.map((procedure) => [procedure.id, procedure]));
  for (const procedure of source.procedures) {
    uniqueIds(`node in procedure ${procedure.id}`, procedure.nodes);
    const nodes = new Set(procedure.nodes.map((node) => node.id));
    if (!nodes.has(procedure.entryNodeId)) throw new Error(`Procedure ${procedure.id} has an invalid entry node.`);
    for (const node of procedure.nodes) {
      for (const effect of node.onEnter ?? []) validateEffect(effect, procedures);
      for (const effect of node.onEnter ?? []) {
        if (effect.kind === 'procedure.transition' && !nodes.has(effect.nodeId)) {
          throw new Error(`Procedure ${procedure.id} transitions to unknown node ${effect.nodeId}.`);
        }
      }
    }
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
    for (const effect of action.effects) {
      validateEffect(effect, procedures);
      if ((effect.kind === 'procedure.transition' || effect.kind === 'procedure.rotate-owner') && procedureRequirements.length === 1) {
        const procedureId = procedureRequirements[0].procedureId;
        const procedure = procedures.get(procedureId) as ProcedureDefinition;
        if (!procedure.nodes.some((node) => node.id === effect.nodeId)) {
          throw new Error(`Action ${action.id} transitions procedure ${procedureId} to unknown node ${effect.nodeId}.`);
        }
      }
    }
  }
  for (const item of source.bootstrap) {
    if (!procedures.has(item.procedureId)) throw new Error(`Bootstrap references unknown procedure ${item.procedureId}.`);
  }

  const normalized = structuredClone(source);
  return { ...normalized, hash: stableHash(normalized) };
}
