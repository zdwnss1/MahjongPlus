import type {
  CoreExpression,
  CoreFormula,
  FiniteDomainProgram,
  RewriteProgram,
} from '@mahjongplus/world-calculus';
import {
  createNoMatchingRecordsConstraint,
  createProgressBatchRewrite,
  createSimpleLedgerTransferCommitRewrite,
  createSimpleLedgerTransferFeasibilityConstraint,
} from '@mahjongplus/world-language';
import {
  aggregate,
  all,
  any,
  choose,
  compare,
  concat,
  externalConstraint,
  filter,
  firstMatching,
  list,
  literal,
  map,
  path,
  quantify,
  record,
  variable,
} from './fixtureDsl.js';
import type { TurboRiichiModel } from './turboRiichiModel.js';
import { TURBO_PLAYERS } from './turboRiichiTypes.js';

const flatten = (source: CoreExpression): CoreExpression => ({ kind: 'flatten', source });

export interface TurboSettlementPrograms {
  constraints: {
    interpretItem: FiniteDomainProgram;
    composeSettlement: FiniteDomainProgram;
    commitSettlement: FiniteDomainProgram;
    ledgerFeasible: FiniteDomainProgram;
    noPendingOutcomes: FiniteDomainProgram;
  };
  rewrites: {
    ronOutcome: RewriteProgram;
    selfOutcome: RewriteProgram;
    appendInterpretation: RewriteProgram;
    interpretationProgress: RewriteProgram;
    composeSettlement: RewriteProgram;
    ledgerCommit: RewriteProgram;
    commitSettlement: RewriteProgram;
  };
}

export function createTurboSettlementPrograms(model: TurboRiichiModel): TurboSettlementPrograms {
  const { policy, entityIndex } = model;
  const world = variable('world');
  const worldEntities = path(world, 'entities');
  const worldRelations = path(world, 'relations');
  const params = variable('params');
  const batchId = path(params, 'batchId');
  const itemKey = path(params, 'itemKey');

  const outcomeBatches = path(
    worldEntities,
    entityIndex('track:outcome-batches'),
    'components',
    'outcomeBatches',
    'records',
  );
  const interpretationProposals = path(
    worldEntities,
    entityIndex('track:interpretation-proposals'),
    'components',
    'interpretationProposals',
    'records',
  );
  const interpretationBatches = path(
    worldEntities,
    entityIndex('track:interpretation-batches'),
    'components',
    'interpretationBatches',
    'records',
  );
  const settlementBatches = path(
    worldEntities,
    entityIndex('track:settlement-batches'),
    'components',
    'settlementBatches',
    'records',
  );
  const settlementTransactions = path(
    worldEntities,
    entityIndex('track:settlement-transactions'),
    'components',
    'settlementTransactions',
    'records',
  );
  const accounts = path(
    worldEntities,
    entityIndex('ledger:points'),
    'components',
    'ledger',
    'accounts',
  );

  const matchingOutcomes = filter(
    outcomeBatches,
    'batch',
    compare('eq', path(variable('batch'), 'id'), batchId),
  );
  const outcome = path(matchingOutcomes, '0');
  const outcomeItems = path(outcome, 'items');
  const matchingItems = filter(
    outcomeItems,
    'item',
    compare('eq', path(variable('item'), 'actionEntityId'), itemKey),
  );
  const item = path(matchingItems, '0');
  const proposalsForBatch = filter(
    interpretationProposals,
    'proposal',
    compare('eq', path(variable('proposal'), 'sourceBatchId'), batchId),
  );
  const proposalForItem = filter(
    proposalsForBatch,
    'proposal',
    compare('eq', path(variable('proposal'), 'sourceItemKey'), itemKey),
  );
  const evidenceRelations = filter(
    worldRelations,
    'relation',
    all(
      compare('eq', path(variable('relation'), 'type'), literal('can-win-on')),
      compare('eq', path(variable('relation'), 'source', 'kind'), literal('player')),
      compare('eq', path(variable('relation'), 'source', 'id'), path(item, 'actorId')),
      compare('eq', path(variable('relation'), 'target', 'kind'), literal('tile')),
      compare('eq', path(variable('relation'), 'target', 'id'), path(outcome, 'metadata', 'sourceEntityId')),
    ),
  );

  const engineActor = compare('eq', variable('actorId'), literal(policy.settlementActorId));
  const interpretItem = externalConstraint('turbo-settlement.interpret-item', all(
    engineActor,
    compare('eq', aggregate('count', matchingOutcomes), literal(1)),
    compare('eq', path(outcome, 'state'), literal('ready')),
    compare('eq', path(outcome, 'kind'), literal('win-outcomes')),
    compare('eq', aggregate('count', matchingItems), literal(1)),
    compare('eq', aggregate('count', proposalForItem), literal(0)),
    compare('eq', aggregate('count', evidenceRelations), literal(1)),
    any(
      compare('eq', path(item, 'mode'), literal('ron')),
      compare('eq', path(item, 'mode'), literal('tsumo')),
    ),
  ));

  const ronTransfers = list(record({
    asset: literal('points'),
    fromAccountId: path(outcome, 'metadata', 'sourceActorId'),
    toAccountId: path(item, 'actorId'),
    amount: literal(policy.ronPayment),
    sourceBatchId: batchId,
    sourceItemKey: itemKey,
    reason: literal('fixture-ron-interpretation'),
  }));
  const tsumoPayers = filter(
    literal(TURBO_PLAYERS),
    'payerId',
    compare('neq', variable('payerId'), path(item, 'actorId')),
  );
  const tsumoTransfers = map(tsumoPayers, 'payerId', record({
    asset: literal('points'),
    fromAccountId: variable('payerId'),
    toAccountId: path(item, 'actorId'),
    amount: literal(policy.tsumoPaymentEach),
    sourceBatchId: batchId,
    sourceItemKey: itemKey,
    reason: literal('fixture-tsumo-interpretation'),
  }));
  const interpretedTransfers = choose(
    compare('eq', path(item, 'mode'), literal('ron')),
    ronTransfers,
    tsumoTransfers,
  );
  const appendInterpretation: RewriteProgram = {
    id: 'turbo-settlement.append-interpretation',
    operations: [{
      kind: 'set',
      path: [
        'world',
        'entities',
        entityIndex('track:interpretation-proposals'),
        'components',
        'interpretationProposals',
        'records',
      ],
      value: concat(interpretationProposals, list(record({
        sourceBatchId: batchId,
        sourceItemKey: itemKey,
        subjectId: path(item, 'actorId'),
        mode: path(item, 'mode'),
        state: literal('accepted'),
        evidenceRelationId: path(evidenceRelations, '0', 'id'),
        sourceEntityId: path(outcome, 'metadata', 'sourceEntityId'),
        transfers: interpretedTransfers,
        interpreterId: literal('fixture:fixed-transfer-profile'),
        interpretedByActionId: variable('actionEntityId'),
      }))),
    }],
  };
  const interpretationProgress = createProgressBatchRewrite({
    id: 'turbo-settlement.progress-interpretation',
    batchesPath: [
      'world',
      'entities',
      entityIndex('track:interpretation-batches'),
      'components',
      'interpretationBatches',
      'records',
    ],
    batches: interpretationBatches,
    batchId,
    batchKind: literal('interpretation'),
    sourceField: 'sourceBatchId',
    sourceId: batchId,
    items: outcomeItems,
    currentItemKey: itemKey,
    metadata: record({ sourceOutcomeKind: path(outcome, 'kind') }),
  });

  const matchingInterpretationBatches = filter(
    interpretationBatches,
    'batch',
    compare('eq', path(variable('batch'), 'id'), batchId),
  );
  const interpretationBatch = path(matchingInterpretationBatches, '0');
  const existingSettlement = filter(
    settlementBatches,
    'batch',
    compare('eq', path(variable('batch'), 'sourceBatchId'), batchId),
  );
  const everyItemCovered: CoreFormula = quantify(
    'forall',
    outcomeItems,
    'outcomeItem',
    compare(
      'eq',
      aggregate('count', filter(
        proposalsForBatch,
        'proposal',
        compare(
          'eq',
          path(variable('proposal'), 'sourceItemKey'),
          path(variable('outcomeItem'), 'actionEntityId'),
        ),
      )),
      literal(1),
    ),
  );
  const everyProposalAccepted = quantify(
    'forall',
    proposalsForBatch,
    'proposal',
    compare('eq', path(variable('proposal'), 'state'), literal('accepted')),
  );
  const orderedProposals = map(
    outcomeItems,
    'outcomeItem',
    firstMatching(
      proposalsForBatch,
      'proposal',
      compare(
        'eq',
        path(variable('proposal'), 'sourceItemKey'),
        path(variable('outcomeItem'), 'actionEntityId'),
      ),
    ),
  );
  const orderedTransfers = flatten(map(
    orderedProposals,
    'proposal',
    path(variable('proposal'), 'transfers'),
  ));
  const composeSettlement = externalConstraint('turbo-settlement.compose', all(
    engineActor,
    compare('eq', aggregate('count', matchingOutcomes), literal(1)),
    compare('eq', path(outcome, 'state'), literal('ready')),
    compare('eq', aggregate('count', matchingInterpretationBatches), literal(1)),
    compare('eq', path(interpretationBatch, 'state'), literal('ready')),
    compare('eq', aggregate('count', proposalsForBatch), aggregate('count', outcomeItems)),
    everyItemCovered,
    everyProposalAccepted,
    compare('gt', aggregate('count', orderedTransfers), literal(0)),
    compare('eq', aggregate('count', existingSettlement), literal(0)),
  ));
  const composeSettlementRewrite: RewriteProgram = {
    id: 'turbo-settlement.compose-batch',
    operations: [{
      kind: 'set',
      path: [
        'world',
        'entities',
        entityIndex('track:settlement-batches'),
        'components',
        'settlementBatches',
        'records',
      ],
      value: concat(settlementBatches, list(record({
        id: batchId,
        kind: literal('resource-transfer'),
        sourceBatchId: batchId,
        proposalKeys: map(orderedProposals, 'proposal', path(variable('proposal'), 'sourceItemKey')),
        transfers: orderedTransfers,
        state: literal('ready'),
        metadata: record({
          continuingHand: path(outcome, 'metadata', 'continuingHand'),
          sourceActorId: path(outcome, 'metadata', 'sourceActorId'),
          sourceEntityId: path(outcome, 'metadata', 'sourceEntityId'),
          sourceEventId: path(outcome, 'metadata', 'sourceEventId'),
        }),
        composedByActionId: variable('actionEntityId'),
      }))),
    }],
  };

  const matchingSettlements = filter(
    settlementBatches,
    'batch',
    compare('eq', path(variable('batch'), 'id'), batchId),
  );
  const settlement = path(matchingSettlements, '0');
  const settlementTransfers = path(settlement, 'transfers');
  const existingTransactions = filter(
    settlementTransactions,
    'transaction',
    compare('eq', path(variable('transaction'), 'sourceBatchId'), batchId),
  );
  const commitSettlement = externalConstraint('turbo-settlement.commit', all(
    engineActor,
    compare('eq', aggregate('count', matchingSettlements), literal(1)),
    compare('eq', path(settlement, 'state'), literal('ready')),
    compare('eq', path(outcome, 'state'), literal('ready')),
    compare('gt', aggregate('count', settlementTransfers), literal(0)),
    compare('eq', aggregate('count', existingTransactions), literal(0)),
  ));
  const ledgerFeasible = createSimpleLedgerTransferFeasibilityConstraint({
    id: 'turbo-settlement.ledger-feasible',
    accounts,
    transfers: settlementTransfers,
    minimumBalance: literal(policy.minimumSettlementBalance),
    expectedAsset: literal('points'),
  });
  const ledgerCommit = createSimpleLedgerTransferCommitRewrite({
    id: 'turbo-settlement.commit-ledger',
    accountsPath: [
      'world',
      'entities',
      entityIndex('ledger:points'),
      'components',
      'ledger',
      'accounts',
    ],
    accounts,
    transfers: settlementTransfers,
  });
  const updatedSettlementBatches = map(
    settlementBatches,
    'batch',
    choose(
      compare('eq', path(variable('batch'), 'id'), batchId),
      record({
        id: path(variable('batch'), 'id'),
        kind: path(variable('batch'), 'kind'),
        sourceBatchId: path(variable('batch'), 'sourceBatchId'),
        proposalKeys: path(variable('batch'), 'proposalKeys'),
        transfers: path(variable('batch'), 'transfers'),
        state: literal('committed'),
        metadata: path(variable('batch'), 'metadata'),
        composedByActionId: path(variable('batch'), 'composedByActionId'),
        committedByActionId: variable('actionEntityId'),
      }),
      variable('batch'),
    ),
  );
  const updatedOutcomeBatches = map(
    outcomeBatches,
    'batch',
    choose(
      compare('eq', path(variable('batch'), 'id'), batchId),
      record({
        id: path(variable('batch'), 'id'),
        kind: path(variable('batch'), 'kind'),
        sourceExposureId: path(variable('batch'), 'sourceExposureId'),
        items: path(variable('batch'), 'items'),
        processedKeys: path(variable('batch'), 'processedKeys'),
        state: literal('consumed'),
        metadata: path(variable('batch'), 'metadata'),
        consumedByActionId: variable('actionEntityId'),
      }),
      variable('batch'),
    ),
  );
  const commitSettlementRewrite: RewriteProgram = {
    id: 'turbo-settlement.commit-status',
    operations: [
      {
        kind: 'set',
        path: [
          'world',
          'entities',
          entityIndex('track:settlement-batches'),
          'components',
          'settlementBatches',
          'records',
        ],
        value: updatedSettlementBatches,
      },
      {
        kind: 'set',
        path: [
          'world',
          'entities',
          entityIndex('track:outcome-batches'),
          'components',
          'outcomeBatches',
          'records',
        ],
        value: updatedOutcomeBatches,
      },
      {
        kind: 'set',
        path: [
          'world',
          'entities',
          entityIndex('track:settlement-transactions'),
          'components',
          'settlementTransactions',
          'records',
        ],
        value: concat(settlementTransactions, list(record({
          sourceBatchId: batchId,
          asset: literal('points'),
          transfers: settlementTransfers,
          state: literal('committed'),
          committedByActionId: variable('actionEntityId'),
        }))),
      },
    ],
  };

  const noPendingOutcomes = createNoMatchingRecordsConstraint({
    id: 'turbo-settlement.no-pending-outcomes',
    records: outcomeBatches,
    as: 'batch',
    where: any(
      compare('eq', path(variable('batch'), 'state'), literal('collecting')),
      compare('eq', path(variable('batch'), 'state'), literal('ready')),
    ),
  });

  const selectedRonItems = map(
    path(variable('window'), 'selected'),
    'selected',
    record({
      actorId: path(variable('selected'), 'actorId'),
      actionId: path(variable('selected'), 'actionId'),
      actionEntityId: path(variable('selected'), 'actionEntityId'),
      mode: literal('ron'),
    }),
  );
  const ronOutcome = createProgressBatchRewrite({
    id: 'turbo-settlement.progress-ron-outcome',
    batchesPath: [
      'world',
      'entities',
      entityIndex('track:outcome-batches'),
      'components',
      'outcomeBatches',
      'records',
    ],
    batches: outcomeBatches,
    batchId: path(variable('window'), 'id'),
    batchKind: literal('win-outcomes'),
    sourceField: 'sourceExposureId',
    sourceId: path(variable('window'), 'sourceEventId'),
    items: selectedRonItems,
    currentItemKey: path(variable('submission'), 'actionEntityId'),
    metadata: record({
      sourceActorId: path(variable('window'), 'sourceActorId'),
      sourceEventId: path(variable('window'), 'sourceEventId'),
      sourceEntityId: path(variable('window'), 'sourceEntityId'),
      continuingHand: literal(true),
    }),
  });

  const latestDraws = path(variable('reducers'), 'turbo-riichi.latest-draw', 'latestDraws');
  const actorDraw = firstMatching(
    latestDraws,
    'draw',
    compare('eq', path(variable('draw'), 'subjectId'), variable('actorId')),
  );
  const selfItems = list(record({
    actorId: variable('actorId'),
    actionId: literal('turbo-riichi.self-win'),
    actionEntityId: variable('actionEntityId'),
    mode: literal('tsumo'),
  }));
  const selfOutcome = createProgressBatchRewrite({
    id: 'turbo-settlement.progress-self-outcome',
    batchesPath: [
      'world',
      'entities',
      entityIndex('track:outcome-batches'),
      'components',
      'outcomeBatches',
      'records',
    ],
    batches: outcomeBatches,
    batchId: path(actorDraw, 'exposureId'),
    batchKind: literal('win-outcomes'),
    sourceField: 'sourceExposureId',
    sourceId: path(actorDraw, 'exposureId'),
    items: selfItems,
    currentItemKey: variable('actionEntityId'),
    metadata: record({
      sourceActorId: variable('actorId'),
      sourceEventId: path(actorDraw, 'exposureId'),
      sourceEntityId: path(actorDraw, 'tileId'),
      continuingHand: literal(true),
    }),
  });

  return {
    constraints: {
      interpretItem,
      composeSettlement,
      commitSettlement,
      ledgerFeasible,
      noPendingOutcomes,
    },
    rewrites: {
      ronOutcome,
      selfOutcome,
      appendInterpretation,
      interpretationProgress,
      composeSettlement: composeSettlementRewrite,
      ledgerCommit,
      commitSettlement: commitSettlementRewrite,
    },
  };
}
