import type {
  ActionDefinition,
  EffectDefinition,
  RequirementDefinition,
  WorldSource,
} from '@mahjongplus/world-language';
import type { FiniteDomainProgram, RewriteProgram } from '@mahjongplus/world-calculus';
import type { EntityRecord } from '@mahjongplus/world-model';
import type { OutcomeSettlementPrograms } from './outcomeSettlementPrograms.js';

const context = (path: string) => ({ kind: 'context', path } as const);

export function appendWorldModuleEntities(
  source: WorldSource,
  entities: EntityRecord[],
): WorldSource {
  const layered = structuredClone(source);
  const known = new Set(layered.entities.map((entity) => entity.id));
  for (const entity of entities) {
    if (known.has(entity.id)) throw new Error(`World module duplicates entity ${entity.id}.`);
    known.add(entity.id);
    layered.entities.push(structuredClone(entity));
  }
  return layered;
}

export function createWorldEntityIndex(source: WorldSource): (id: string) => string {
  const indices = new Map(source.entities.map((entity, index) => [entity.id, String(index)]));
  return (id: string): string => {
    const value = indices.get(id);
    if (value == null) throw new Error(`World module binding references unknown entity ${id}.`);
    return value;
  };
}

export type EffectPatchTarget =
  | {
      kind: 'response-selection';
      windowId: string;
      actionId: string;
      placement: 'prepend' | 'append' | 'after-program';
      anchorProgramId?: string;
    }
  | {
      kind: 'action';
      actionId: string;
      placement: 'prepend' | 'append' | 'after-program';
      anchorProgramId?: string;
    };

export interface EffectPatchDefinition {
  target: EffectPatchTarget;
  effects: EffectDefinition[];
}

export interface PipelineActionIds {
  interpret: string;
  compose: string;
  commit: string;
}

export interface OutcomeSettlementModuleDefinition {
  id: string;
  programs: OutcomeSettlementPrograms;
  producerPatches: EffectPatchDefinition[];
  gateActionIds: string[];
  actionIds?: Partial<PipelineActionIds>;
  additionalConstraints?: FiniteDomainProgram[];
  additionalRewrites?: RewriteProgram[];
  metadata?: Record<string, unknown>;
}

function requireAction(source: WorldSource, id: string): ActionDefinition {
  const action = source.actions.find((entry) => entry.id === id);
  if (!action) throw new Error(`World module references unknown action ${id}.`);
  return action;
}

function insertEffects(target: EffectDefinition[], patch: EffectPatchDefinition): void {
  if (patch.target.placement === 'prepend') {
    target.unshift(...structuredClone(patch.effects));
    return;
  }
  if (patch.target.placement === 'append') {
    target.push(...structuredClone(patch.effects));
    return;
  }
  if (!patch.target.anchorProgramId) throw new Error('after-program placement requires anchorProgramId.');
  const index = target.findIndex((effect) =>
    effect.kind === 'core.rewrite' && effect.programId === patch.target.anchorProgramId);
  if (index < 0) throw new Error(`Effect patch anchor ${patch.target.anchorProgramId} was not found.`);
  target.splice(index + 1, 0, ...structuredClone(patch.effects));
}

function applyEffectPatch(source: WorldSource, patch: EffectPatchDefinition): void {
  if (patch.target.kind === 'action') {
    insertEffects(requireAction(source, patch.target.actionId).effects, patch);
    return;
  }
  const window = source.responseWindows?.find((entry) => entry.id === patch.target.windowId);
  if (!window) throw new Error(`World module references unknown response window ${patch.target.windowId}.`);
  const effects = window.selectionEffects[patch.target.actionId];
  if (!effects) throw new Error(`Response window ${patch.target.windowId} has no effects for ${patch.target.actionId}.`);
  insertEffects(effects, patch);
}

function pendingOutcomeRequirement(programId: string, id: string): RequirementDefinition {
  return {
    id,
    kind: 'core.constraint',
    programId,
    message: 'A durable outcome batch is waiting for interpretation or settlement.',
  };
}

function createPipelineActions(
  programs: OutcomeSettlementPrograms,
  ids: PipelineActionIds,
): ActionDefinition[] {
  return [
    {
      id: ids.interpret,
      parameters: { batchId: 'string', itemKey: 'string' },
      requirements: [
        { id: `${ids.interpret}.batch`, kind: 'parameter-present', parameter: 'batchId', message: 'A source batch id is required.' },
        { id: `${ids.interpret}.item`, kind: 'parameter-present', parameter: 'itemKey', message: 'A source item key is required.' },
        {
          id: `${ids.interpret}.eligible`,
          kind: 'core.constraint',
          programId: programs.constraints.interpretItem.id,
          message: 'This outcome item is not available for interpretation.',
        },
      ],
      effects: [
        { kind: 'core.rewrite', programId: programs.rewrites.appendInterpretation.id },
        { kind: 'core.rewrite', programId: programs.rewrites.interpretationProgress.id },
        {
          kind: 'event.emit',
          eventType: 'interpretation.proposal-recorded',
          subjects: [{ kind: 'actor' }],
          payload: { batchId: context('params.batchId'), itemKey: context('params.itemKey') },
        },
      ],
    },
    {
      id: ids.compose,
      parameters: { batchId: 'string' },
      requirements: [
        { id: `${ids.compose}.batch`, kind: 'parameter-present', parameter: 'batchId', message: 'A source batch id is required.' },
        {
          id: `${ids.compose}.eligible`,
          kind: 'core.constraint',
          programId: programs.constraints.composeSettlement.id,
          message: 'The interpretation batch is not ready for settlement composition.',
        },
      ],
      effects: [
        { kind: 'core.rewrite', programId: programs.rewrites.composeSettlement.id },
        {
          kind: 'event.emit',
          eventType: 'settlement.batch-ready',
          subjects: [{ kind: 'actor' }],
          payload: { batchId: context('params.batchId') },
        },
      ],
    },
    {
      id: ids.commit,
      parameters: { batchId: 'string' },
      requirements: [
        { id: `${ids.commit}.batch`, kind: 'parameter-present', parameter: 'batchId', message: 'A settlement batch id is required.' },
        {
          id: `${ids.commit}.eligible`,
          kind: 'core.constraint',
          programId: programs.constraints.commitSettlement.id,
          message: 'The settlement batch is not ready to commit.',
        },
        {
          id: `${ids.commit}.ledger`,
          kind: 'core.constraint',
          programId: programs.constraints.ledgerFeasible.id,
          message: 'The aggregate transfer set violates the ledger balance policy.',
        },
      ],
      effects: [
        { kind: 'core.rewrite', programId: programs.rewrites.ledgerCommit.id },
        { kind: 'core.rewrite', programId: programs.rewrites.commitSettlement.id },
        {
          kind: 'event.emit',
          eventType: 'settlement.committed',
          subjects: [{ kind: 'actor' }],
          payload: { batchId: context('params.batchId') },
        },
      ],
    },
  ];
}

export function composeOutcomeSettlementModule(
  source: WorldSource,
  definition: OutcomeSettlementModuleDefinition,
): WorldSource {
  if (!definition.id) throw new Error('World module id is required.');
  const layered = structuredClone(source);
  for (const patch of definition.producerPatches) applyEffectPatch(layered, patch);
  for (const actionId of definition.gateActionIds) {
    requireAction(layered, actionId).requirements.push(pendingOutcomeRequirement(
      definition.programs.constraints.noPendingOutcomes.id,
      `${actionId}.${definition.id}.outcomes-complete`,
    ));
  }

  const actionIds: PipelineActionIds = {
    interpret: definition.actionIds?.interpret ?? 'pipeline.interpret-outcome-item',
    compose: definition.actionIds?.compose ?? 'pipeline.compose-settlement',
    commit: definition.actionIds?.commit ?? 'pipeline.commit-settlement',
  };
  for (const action of createPipelineActions(definition.programs, actionIds)) {
    if (layered.actions.some((entry) => entry.id === action.id)) throw new Error(`Duplicate layered action ${action.id}.`);
    layered.actions.push(action);
  }

  layered.corePrograms ??= {};
  layered.corePrograms.constraints = [
    ...(layered.corePrograms.constraints ?? []),
    ...Object.values(definition.programs.constraints),
    ...(definition.additionalConstraints ?? []),
  ];
  layered.corePrograms.rewrites = [
    ...(layered.corePrograms.rewrites ?? []),
    ...Object.values(definition.programs.rewrites),
    ...(definition.additionalRewrites ?? []),
  ];
  layered.metadata = {
    ...(layered.metadata ?? {}),
    worldModules: [
      ...((layered.metadata?.worldModules as unknown[] | undefined) ?? []),
      {
        id: definition.id,
        kind: 'outcome-settlement',
        actions: actionIds,
        ...(definition.metadata ?? {}),
      },
    ],
  };
  return layered;
}
