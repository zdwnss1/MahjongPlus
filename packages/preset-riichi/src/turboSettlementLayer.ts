import type {
  ActionDefinition,
  RequirementDefinition,
  WorldSource,
} from '@mahjongplus/world-language';
import { createTurboRiichiFixture } from './turboRiichi.js';
import { createTurboRiichiModel, type TurboRiichiModel } from './turboRiichiModel.js';
import { createTurboSettlementPrograms } from './turboSettlementPrograms.js';
import type { TurboRiichiFixture, TurboRiichiOptions } from './turboRiichiTypes.js';

export type { TurboRiichiSeat } from './turboRiichiTypes.js';

const context = (path: string) => ({ kind: 'context', path } as const);

function requireAction(source: WorldSource, id: string): ActionDefinition {
  const action = source.actions.find((entry) => entry.id === id);
  if (!action) throw new Error(`Settlement layer requires action ${id}.`);
  return action;
}

function pendingOutcomeRequirement(programId: string, id: string): RequirementDefinition {
  return {
    id,
    kind: 'core.constraint',
    programId,
    message: 'A win outcome is waiting for interpretation or settlement.',
  };
}

export function applyTurboSettlementLayer(
  source: WorldSource,
  model: TurboRiichiModel,
): WorldSource {
  const layered = structuredClone(source);
  const programs = createTurboSettlementPrograms(model);
  const window = layered.responseWindows?.find((entry) => entry.id === 'turbo-riichi.win-opportunity');
  if (!window) throw new Error('Settlement layer requires the turbo win response window.');
  const ronEffects = window.selectionEffects['turbo-riichi.win'];
  if (!ronEffects) throw new Error('Settlement layer requires turbo ron selection effects.');
  const responseBatchIndex = ronEffects.findIndex((effect) =>
    effect.kind === 'core.rewrite' && effect.programId === 'turbo-riichi.collect-response-batch');
  ronEffects.splice(responseBatchIndex < 0 ? 0 : responseBatchIndex + 1, 0, {
    kind: 'core.rewrite',
    programId: programs.rewrites.ronOutcome.id,
  });

  const selfWin = requireAction(layered, 'turbo-riichi.self-win');
  selfWin.effects.unshift({ kind: 'core.rewrite', programId: programs.rewrites.selfOutcome.id });

  requireAction(layered, 'draw').requirements.push(pendingOutcomeRequirement(
    programs.constraints.noPendingOutcomes.id,
    'draw.settlements-complete',
  ));
  requireAction(layered, 'discard').requirements.push(pendingOutcomeRequirement(
    programs.constraints.noPendingOutcomes.id,
    'discard.settlements-complete',
  ));
  requireAction(layered, 'end-exhaustive-draw').requirements.push(pendingOutcomeRequirement(
    programs.constraints.noPendingOutcomes.id,
    'end.settlements-complete',
  ));

  const pipelineActions: ActionDefinition[] = [
    {
      id: 'pipeline.interpret-outcome-item',
      parameters: { batchId: 'string', itemKey: 'string' },
      requirements: [
        { id: 'pipeline.interpret.batch', kind: 'parameter-present', parameter: 'batchId', message: 'A source batch id is required.' },
        { id: 'pipeline.interpret.item', kind: 'parameter-present', parameter: 'itemKey', message: 'A source item key is required.' },
        {
          id: 'pipeline.interpret.eligible',
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
      id: 'pipeline.compose-settlement',
      parameters: { batchId: 'string' },
      requirements: [
        { id: 'pipeline.compose.batch', kind: 'parameter-present', parameter: 'batchId', message: 'A source batch id is required.' },
        {
          id: 'pipeline.compose.eligible',
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
      id: 'pipeline.commit-settlement',
      parameters: { batchId: 'string' },
      requirements: [
        { id: 'pipeline.commit.batch', kind: 'parameter-present', parameter: 'batchId', message: 'A settlement batch id is required.' },
        {
          id: 'pipeline.commit.eligible',
          kind: 'core.constraint',
          programId: programs.constraints.commitSettlement.id,
          message: 'The settlement batch is not ready to commit.',
        },
        {
          id: 'pipeline.commit.ledger',
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
          payload: { batchId: context('params.batchId'), continuingHand: true },
        },
      ],
    },
  ];
  for (const action of pipelineActions) {
    if (layered.actions.some((entry) => entry.id === action.id)) throw new Error(`Duplicate layered action ${action.id}.`);
    layered.actions.push(action);
  }

  layered.corePrograms ??= {};
  layered.corePrograms.constraints = [
    ...(layered.corePrograms.constraints ?? []),
    ...Object.values(programs.constraints),
  ];
  layered.corePrograms.rewrites = [
    ...(layered.corePrograms.rewrites ?? []),
    ...Object.values(programs.rewrites),
  ];
  layered.metadata = {
    ...(layered.metadata ?? {}),
    settlementPipeline: {
      source: 'outcome-batches',
      interpretation: 'one proposal per source item',
      composition: 'ordered proposal transfers are concatenated into one settlement batch',
      commit: 'aggregate feasibility check followed by atomic ledger and lifecycle rewrites',
      fixtureProfile: {
        ronPayment: model.policy.ronPayment,
        tsumoPaymentEach: model.policy.tsumoPaymentEach,
        minimumBalance: model.policy.minimumSettlementBalance,
      },
    },
  };
  return layered;
}

export function createSettledTurboRiichiFixture(
  options: TurboRiichiOptions = {},
): TurboRiichiFixture {
  const base = createTurboRiichiFixture(options);
  const model = createTurboRiichiModel(options);
  return { ...base, source: applyTurboSettlementLayer(base.source, model) };
}
