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

const flatten = (source: CoreExpression): CoreExpression => ({ kind: 'flatten', source });

export interface RecordTrackBinding {
  entityId: string;
  component: string;
}

export interface LedgerBinding {
  entityId: string;
  component: string;
  accountsField?: string;
}

export interface OutcomeSettlementBindings {
  entityIndex(id: string): string;
  tracks: {
    outcomes: RecordTrackBinding;
    proposals: RecordTrackBinding;
    interpretationBatches: RecordTrackBinding;
    settlementBatches: RecordTrackBinding;
    transactions: RecordTrackBinding;
  };
  ledger: LedgerBinding;
}

export interface EvidenceBinding {
  relationType: string;
  sourceKind: string;
  targetKind: string;
  sourceId: CoreExpression;
  targetId: CoreExpression;
}

export interface TransferShapeDefinition {
  when: CoreFormula;
  transfers: CoreExpression;
}

export interface OutcomeInterpreterDefinition {
  id: string;
  systemActorId: string;
  outcomeKind: string;
  outcomeSourceField: string;
  allowedModes: string[];
  itemKey: CoreExpression;
  subjectId: CoreExpression;
  mode: CoreExpression;
  evidence: EvidenceBinding;
  transferShapes: TransferShapeDefinition[];
  asset: string;
  minimumBalance: number;
}

export interface OutcomeSettlementPrograms {
  constraints: {
    interpretItem: FiniteDomainProgram;
    composeSettlement: FiniteDomainProgram;
    commitSettlement: FiniteDomainProgram;
    ledgerFeasible: FiniteDomainProgram;
    noPendingOutcomes: FiniteDomainProgram;
  };
  rewrites: {
    appendInterpretation: RewriteProgram;
    interpretationProgress: RewriteProgram;
    composeSettlement: RewriteProgram;
    ledgerCommit: RewriteProgram;
    commitSettlement: RewriteProgram;
  };
}

function recordsExpression(
  worldEntities: CoreExpression,
  entityIndex: OutcomeSettlementBindings['entityIndex'],
  binding: RecordTrackBinding,
): CoreExpression {
  return path(worldEntities, entityIndex(binding.entityId), 'components', binding.component, 'records');
}

function recordsPath(
  entityIndex: OutcomeSettlementBindings['entityIndex'],
  binding: RecordTrackBinding,
): string[] {
  return ['world', 'entities', entityIndex(binding.entityId), 'components', binding.component, 'records'];
}

function bindTemplate<T>(value: T, bindings: Record<string, CoreExpression>): T {
  if (Array.isArray(value)) return value.map((entry) => bindTemplate(entry, bindings)) as T;
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  if (object.kind === 'variable' && typeof object.name === 'string' && bindings[object.name]) {
    return structuredClone(bindings[object.name]) as T;
  }
  return Object.fromEntries(Object.entries(object)
    .map(([key, entry]) => [key, bindTemplate(entry, bindings)])) as T;
}

function transferShapeExpression(
  definition: OutcomeInterpreterDefinition,
  bindings: Record<string, CoreExpression>,
): CoreExpression {
  if (definition.transferShapes.length === 0) throw new Error('At least one transfer shape is required.');
  return [...definition.transferShapes].reverse().reduce<CoreExpression>(
    (fallback, shape) => choose(
      bindTemplate(shape.when, bindings),
      bindTemplate(shape.transfers, bindings),
      fallback,
    ),
    literal([]),
  );
}

export function compileOutcomeSettlementPrograms(
  bindings: OutcomeSettlementBindings,
  definition: OutcomeInterpreterDefinition,
): OutcomeSettlementPrograms {
  if (!definition.id) throw new Error('Outcome interpreter id is required.');
  if (!definition.systemActorId) throw new Error('Outcome interpreter actor id is required.');
  if (!definition.outcomeKind) throw new Error('Outcome kind is required.');
  if (!definition.outcomeSourceField) throw new Error('Outcome source field is required.');
  if (definition.allowedModes.length === 0) throw new Error('At least one outcome mode is required.');
  if (!definition.asset) throw new Error('Settlement asset is required.');
  if (!Number.isFinite(definition.minimumBalance)) throw new Error('Minimum balance must be finite.');

  const { entityIndex } = bindings;
  const world = variable('world');
  const worldEntities = path(world, 'entities');
  const worldRelations = path(world, 'relations');
  const params = variable('params');
  const batchId = path(params, 'batchId');
  const itemKey = path(params, 'itemKey');

  const outcomeBatches = recordsExpression(worldEntities, entityIndex, bindings.tracks.outcomes);
  const interpretationProposals = recordsExpression(worldEntities, entityIndex, bindings.tracks.proposals);
  const interpretationBatches = recordsExpression(worldEntities, entityIndex, bindings.tracks.interpretationBatches);
  const settlementBatches = recordsExpression(worldEntities, entityIndex, bindings.tracks.settlementBatches);
  const settlementTransactions = recordsExpression(worldEntities, entityIndex, bindings.tracks.transactions);
  const accountsField = bindings.ledger.accountsField ?? 'accounts';
  const accounts = path(
    worldEntities,
    entityIndex(bindings.ledger.entityId),
    'components',
    bindings.ledger.component,
    accountsField,
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
    compare('eq', definition.itemKey, itemKey),
  );
  const item = path(matchingItems, '0');
  const templateBindings = { outcome, item, batchId, itemKey };
  const selectedItemKey = bindTemplate(definition.itemKey, templateBindings);
  const selectedSubjectId = bindTemplate(definition.subjectId, templateBindings);
  const selectedMode = bindTemplate(definition.mode, templateBindings);
  const evidenceSourceId = bindTemplate(definition.evidence.sourceId, templateBindings);
  const evidenceTargetId = bindTemplate(definition.evidence.targetId, templateBindings);

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
      compare('eq', path(variable('relation'), 'type'), literal(definition.evidence.relationType)),
      compare('eq', path(variable('relation'), 'source', 'kind'), literal(definition.evidence.sourceKind)),
      compare('eq', path(variable('relation'), 'source', 'id'), evidenceSourceId),
      compare('eq', path(variable('relation'), 'target', 'kind'), literal(definition.evidence.targetKind)),
      compare('eq', path(variable('relation'), 'target', 'id'), evidenceTargetId),
    ),
  );

  const systemActor = compare('eq', variable('actorId'), literal(definition.systemActorId));
  const interpretItem = externalConstraint(`${definition.id}.interpret-item`, all(
    systemActor,
    compare('eq', aggregate('count', matchingOutcomes), literal(1)),
    compare('eq', path(outcome, 'state'), literal('ready')),
    compare('eq', path(outcome, 'kind'), literal(definition.outcomeKind)),
    compare('eq', aggregate('count', matchingItems), literal(1)),
    compare('eq', selectedItemKey, itemKey),
    compare('eq', aggregate('count', proposalForItem), literal(0)),
    compare('eq', aggregate('count', evidenceRelations), literal(1)),
    { kind: 'contains', collection: literal(definition.allowedModes), value: selectedMode },
  ));

  const interpretedTransfers = transferShapeExpression(definition, templateBindings);
  const appendInterpretation: RewriteProgram = {
    id: `${definition.id}.append-interpretation`,
    operations: [{
      kind: 'set',
      path: recordsPath(entityIndex, bindings.tracks.proposals),
      value: concat(interpretationProposals, list(record({
        sourceBatchId: batchId,
        sourceItemKey: itemKey,
        subjectId: selectedSubjectId,
        mode: selectedMode,
        state: literal('accepted'),
        evidenceRelationId: path(evidenceRelations, '0', 'id'),
        sourceEntityId: evidenceTargetId,
        transfers: interpretedTransfers,
        interpreterId: literal(definition.id),
        interpretedByActionId: variable('actionEntityId'),
      }))),
    }],
  };
  const interpretationProgress = createProgressBatchRewrite({
    id: `${definition.id}.progress-interpretation`,
    batchesPath: recordsPath(entityIndex, bindings.tracks.interpretationBatches),
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
  const outcomeItemKey = bindTemplate(definition.itemKey, {
    ...templateBindings,
    item: variable('outcomeItem'),
  });
  const everyItemCovered: CoreFormula = quantify(
    'forall',
    outcomeItems,
    'outcomeItem',
    compare(
      'eq',
      aggregate('count', filter(
        proposalsForBatch,
        'proposal',
        compare('eq', path(variable('proposal'), 'sourceItemKey'), outcomeItemKey),
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
      compare('eq', path(variable('proposal'), 'sourceItemKey'), outcomeItemKey),
    ),
  );
  const orderedTransfers = flatten(map(orderedProposals, 'proposal', path(variable('proposal'), 'transfers')));
  const composeSettlement = externalConstraint(`${definition.id}.compose`, all(
    systemActor,
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
    id: `${definition.id}.compose-batch`,
    operations: [{
      kind: 'set',
      path: recordsPath(entityIndex, bindings.tracks.settlementBatches),
      value: concat(settlementBatches, list(record({
        id: batchId,
        kind: literal('resource-transfer'),
        sourceBatchId: batchId,
        proposalKeys: map(orderedProposals, 'proposal', path(variable('proposal'), 'sourceItemKey')),
        transfers: orderedTransfers,
        state: literal('ready'),
        metadata: path(outcome, 'metadata'),
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
  const commitSettlement = externalConstraint(`${definition.id}.commit`, all(
    systemActor,
    compare('eq', aggregate('count', matchingSettlements), literal(1)),
    compare('eq', path(settlement, 'state'), literal('ready')),
    compare('eq', aggregate('count', matchingOutcomes), literal(1)),
    compare('eq', path(outcome, 'state'), literal('ready')),
    compare('gt', aggregate('count', settlementTransfers), literal(0)),
    compare('eq', aggregate('count', existingTransactions), literal(0)),
  ));
  const ledgerFeasible = createSimpleLedgerTransferFeasibilityConstraint({
    id: `${definition.id}.ledger-feasible`,
    accounts,
    transfers: settlementTransfers,
    minimumBalance: literal(definition.minimumBalance),
    expectedAsset: literal(definition.asset),
  });
  const ledgerCommit = createSimpleLedgerTransferCommitRewrite({
    id: `${definition.id}.commit-ledger`,
    accountsPath: [
      'world',
      'entities',
      entityIndex(bindings.ledger.entityId),
      'components',
      bindings.ledger.component,
      accountsField,
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
        [definition.outcomeSourceField]: path(variable('batch'), definition.outcomeSourceField),
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
    id: `${definition.id}.commit-status`,
    operations: [
      {
        kind: 'set',
        path: recordsPath(entityIndex, bindings.tracks.settlementBatches),
        value: updatedSettlementBatches,
      },
      {
        kind: 'set',
        path: recordsPath(entityIndex, bindings.tracks.outcomes),
        value: updatedOutcomeBatches,
      },
      {
        kind: 'set',
        path: recordsPath(entityIndex, bindings.tracks.transactions),
        value: concat(settlementTransactions, list(record({
          sourceBatchId: batchId,
          asset: literal(definition.asset),
          transfers: settlementTransfers,
          state: literal('committed'),
          committedByActionId: variable('actionEntityId'),
        }))),
      },
    ],
  };

  const noPendingOutcomes = createNoMatchingRecordsConstraint({
    id: `${definition.id}.no-pending-outcomes`,
    records: outcomeBatches,
    as: 'batch',
    where: any(
      compare('eq', path(variable('batch'), 'state'), literal('collecting')),
      compare('eq', path(variable('batch'), 'state'), literal('ready')),
    ),
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
      appendInterpretation,
      interpretationProgress,
      composeSettlement: composeSettlementRewrite,
      ledgerCommit,
      commitSettlement: commitSettlementRewrite,
    },
  };
}
