import { describe, expect, it } from 'vitest';
import type { CoreExpression, CoreFormula } from '@mahjongplus/world-calculus';
import {
  compileWorld,
  composeWorldModules,
  createProgressBatchRewrite,
} from '@mahjongplus/world-language';
import type { EntityRecord } from '@mahjongplus/world-model';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import {
  appendWorldModuleEntities,
  composeOutcomeSettlementModule,
  createWorldEntityIndex,
} from '../src/outcomeSettlementModule.js';
import { compileOutcomeSettlementPrograms } from '../src/outcomeSettlementPrograms.js';
import {
  CONTINUING_WIN_FLOW_MODULE,
  TURBO_DECLARATION_MODULE,
} from '../src/turboRiichiModules.js';
import { buildTurnWorldFixture, type PhysicalTileSpec } from './support/turnWorldFixture.js';

type Seat = 'east' | 'south' | 'west' | 'north';
const SEATS: Seat[] = ['east', 'south', 'west', 'north'];
const NEXT: Record<Seat, Seat> = {
  east: 'south', south: 'west', west: 'north', north: 'east',
};

interface SetupOptions {
  startingPoints?: number;
  wallTileCount?: number;
  singlePayerAmount?: number;
  sharedPayerAmount?: number;
  minimumBalance?: number;
  systemActorId?: string;
}

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });

function factTrack(id: string, component: string): EntityRecord {
  return { id, kind: 'fact-track', components: { [component]: { records: [] } } };
}

function filler(seat: Seat, count: number): PhysicalTileSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tile:${seat}:filler:${index}`,
    face: `${['m', 'p', 's'][index % 3]}${(index % 9) + 1}`,
  }));
}

function setup(options: SetupOptions = {}) {
  const singlePayerAmount = options.singlePayerAmount ?? 2000;
  const sharedPayerAmount = options.sharedPayerAmount ?? 1000;
  const minimumBalance = options.minimumBalance ?? 0;
  const systemActorId = options.systemActorId ?? 'system:settlement';
  const tripletIds = Array.from({ length: 3 }, (_, index) => `tile:east:m7:${index}`);
  const initialDrawId = 'tile:east:initial-draw';
  const wall: PhysicalTileSpec[] = Array.from({ length: options.wallTileCount ?? 8 }, (_, index) => ({
    id: `tile:wall:${index}`,
    face: index === 0 ? 's9' : `p${(index % 9) + 1}`,
  }));
  const firstWallTileId = wall[0].id;
  const hands = Object.fromEntries(SEATS.map((seat) => [
    seat,
    seat === 'east'
      ? [
          ...tripletIds.map((id) => ({ id, face: 'm7' })),
          ...filler(seat, 10),
          { id: initialDrawId, face: 'p5' },
        ]
      : filler(seat, 13),
  ])) as Record<Seat, PhysicalTileSpec[]>;
  const base = buildTurnWorldFixture({
    seats: SEATS,
    initialOwnerId: 'east',
    startingPoints: options.startingPoints,
    hands,
    wall,
    canWinOn: [
      { playerId: 'south', tileId: initialDrawId },
      { playerId: 'west', tileId: initialDrawId },
      { playerId: 'south', tileId: firstWallTileId },
      { playerId: 'east', tileId: firstWallTileId },
      { playerId: 'west', tileId: firstWallTileId },
    ],
  });
  const initialDraws = SEATS.map((subjectId) => ({
    subjectId,
    tileId: subjectId === 'east' ? initialDrawId : null,
    exposureId: subjectId === 'east' ? 'initial-exposure:east' : null,
  }));
  const ruleWorld = composeWorldModules(base.source, [
    {
      definition: TURBO_DECLARATION_MODULE,
      bindings: {
        ledgerId: base.bindings.ledgerId,
        playerIds: base.bindings.playerIds,
        turnProcedureId: base.bindings.turnProcedureId,
        awaitDiscardNodeId: base.bindings.awaitDiscardNodeId,
      },
    },
    {
      definition: CONTINUING_WIN_FLOW_MODULE,
      bindings: {
        ...base.bindings,
        initialDraws,
        discardPolicyTrackId: 'track:discard-policies',
      },
    },
  ]).world;

  const storageEntities: EntityRecord[] = [
    { id: systemActorId, kind: 'system-actor', components: { systemRole: { role: 'outcome-settlement' } } },
    factTrack('track:outcome-batches', 'outcomeBatches'),
    factTrack('track:interpretation-proposals', 'interpretationProposals'),
    factTrack('track:interpretation-batches', 'interpretationBatches'),
    factTrack('track:settlement-batches', 'settlementBatches'),
    factTrack('track:settlement-transactions', 'settlementTransactions'),
  ];
  const sourceWithStorage = appendWorldModuleEntities(ruleWorld, storageEntities);
  const entityIndex = createWorldEntityIndex(sourceWithStorage);
  const worldEntities = path(variable('world'), 'entities');
  const outcomeRecords = path(
    worldEntities,
    entityIndex('track:outcome-batches'),
    'components',
    'outcomeBatches',
    'records',
  );
  const selectedItems = map(
    path(variable('window'), 'selected'),
    'selected',
    record({
      actorId: path(variable('selected'), 'actorId'),
      actionId: path(variable('selected'), 'actionId'),
      actionEntityId: path(variable('selected'), 'actionEntityId'),
      mode: literal('ron'),
    }),
  );
  const selectedOutcome = createProgressBatchRewrite({
    id: 'fixture.outcome.selected',
    batchesPath: [
      'world', 'entities', entityIndex('track:outcome-batches'),
      'components', 'outcomeBatches', 'records',
    ],
    batches: outcomeRecords,
    batchId: path(variable('window'), 'id'),
    batchKind: literal('win-outcomes'),
    sourceField: 'sourceExposureId',
    sourceId: path(variable('window'), 'sourceEventId'),
    items: selectedItems,
    currentItemKey: path(variable('submission'), 'actionEntityId'),
    metadata: record({
      sourceActorId: path(variable('window'), 'sourceActorId'),
      sourceEventId: path(variable('window'), 'sourceEventId'),
      sourceEntityId: path(variable('window'), 'sourceEntityId'),
      continuingHand: literal(true),
    }),
  });
  const latestDraws = path(variable('reducers'), 'module.continuing-win.latest-draw', 'latestDraws');
  const actorDraw = path(filter(
    latestDraws,
    'draw',
    compare('eq', path(variable('draw'), 'subjectId'), variable('actorId')),
  ), '0');
  const directOutcome = createProgressBatchRewrite({
    id: 'fixture.outcome.direct',
    batchesPath: [
      'world', 'entities', entityIndex('track:outcome-batches'),
      'components', 'outcomeBatches', 'records',
    ],
    batches: outcomeRecords,
    batchId: path(actorDraw, 'exposureId'),
    batchKind: literal('win-outcomes'),
    sourceField: 'sourceExposureId',
    sourceId: path(actorDraw, 'exposureId'),
    items: list(record({
      actorId: variable('actorId'),
      actionId: literal('turbo-riichi.self-win'),
      actionEntityId: variable('actionEntityId'),
      mode: literal('tsumo'),
    })),
    currentItemKey: variable('actionEntityId'),
    metadata: record({
      sourceActorId: variable('actorId'),
      sourceEventId: path(actorDraw, 'exposureId'),
      sourceEntityId: path(actorDraw, 'tileId'),
      continuingHand: literal(true),
    }),
  });

  const itemMode = path(variable('item'), 'mode');
  const itemSubject = path(variable('item'), 'actorId');
  const batchId = variable('batchId');
  const itemKey = variable('itemKey');
  const singlePayerTransfers = list(record({
    asset: literal('points'),
    fromAccountId: path(variable('outcome'), 'metadata', 'sourceActorId'),
    toAccountId: itemSubject,
    amount: literal(singlePayerAmount),
    sourceBatchId: batchId,
    sourceItemKey: itemKey,
    reason: literal('fixture-single-payer'),
  }));
  const sharedPayers = filter(
    literal(SEATS),
    'payerId',
    compare('neq', variable('payerId'), itemSubject),
  );
  const sharedPayerTransfers = map(sharedPayers, 'payerId', record({
    asset: literal('points'),
    fromAccountId: variable('payerId'),
    toAccountId: itemSubject,
    amount: literal(sharedPayerAmount),
    sourceBatchId: batchId,
    sourceItemKey: itemKey,
    reason: literal('fixture-shared-payer'),
  }));
  const programs = compileOutcomeSettlementPrograms({
    entityIndex,
    tracks: {
      outcomes: { entityId: 'track:outcome-batches', component: 'outcomeBatches' },
      proposals: { entityId: 'track:interpretation-proposals', component: 'interpretationProposals' },
      interpretationBatches: { entityId: 'track:interpretation-batches', component: 'interpretationBatches' },
      settlementBatches: { entityId: 'track:settlement-batches', component: 'settlementBatches' },
      transactions: { entityId: 'track:settlement-transactions', component: 'settlementTransactions' },
    },
    ledger: { entityId: 'ledger:points', component: 'ledger' },
  }, {
    id: 'fixture.fixed-transfer-interpreter',
    systemActorId,
    outcomeKind: 'win-outcomes',
    outcomeSourceField: 'sourceExposureId',
    allowedModes: ['ron', 'tsumo'],
    itemKey: path(variable('item'), 'actionEntityId'),
    subjectId: itemSubject,
    mode: itemMode,
    evidence: {
      relationType: 'can-win-on',
      sourceKind: 'player',
      targetKind: 'tile',
      sourceId: itemSubject,
      targetId: path(variable('outcome'), 'metadata', 'sourceEntityId'),
    },
    transferShapes: [
      { when: compare('eq', itemMode, literal('ron')), transfers: singlePayerTransfers },
      { when: compare('eq', itemMode, literal('tsumo')), transfers: sharedPayerTransfers },
    ],
    asset: 'points',
    minimumBalance,
  });
  const source = composeOutcomeSettlementModule(sourceWithStorage, {
    id: 'fixture.outcome-settlement',
    programs,
    producerPatches: [
      {
        target: {
          kind: 'response-selection',
          windowId: 'turbo-riichi.win-opportunity',
          actionId: 'turbo-riichi.win',
          placement: 'after-program',
          anchorProgramId: 'module.continuing-win.collect-response-batch',
        },
        effects: [{ kind: 'core.rewrite', programId: selectedOutcome.id }],
      },
      {
        target: { kind: 'action', actionId: 'turbo-riichi.self-win', placement: 'prepend' },
        effects: [{ kind: 'core.rewrite', programId: directOutcome.id }],
      },
    ],
    gateActionIds: ['draw', 'discard', 'end-exhaustive-draw'],
    additionalRewrites: [selectedOutcome, directOutcome],
    metadata: {
      interpreterProfile: { singlePayerAmount, sharedPayerAmount, minimumBalance },
    },
  });
  const value = new WorldRuntime(compileWorld(source));
  value.start();
  return {
    value,
    ids: { tripletIds, initialDrawId, firstWallTileId },
    profile: { singlePayerAmount, sharedPayerAmount, minimumBalance, systemActorId },
  };
}

function act(
  value: WorldRuntime,
  attemptId: string,
  actorId: string,
  actionId: string,
  parameters: Record<string, unknown> = {},
) {
  return value.attempt({ attemptId, actorId, actionId, observedRevision: value.currentRevision, parameters });
}

function declare(value: WorldRuntime, tileIds: string[]) {
  return act(value, 'declare', 'east', 'declare-turbo-riichi', { tileIds });
}

function discard(value: WorldRuntime, attemptId: string, actorId: Seat, tileId: string) {
  return act(value, attemptId, actorId, 'discard', { tileId, nextActorId: NEXT[actorId] });
}

function respond(value: WorldRuntime, attemptId: string, actorId: string, actionId: string, windowId: string) {
  return act(value, attemptId, actorId, actionId, { windowId });
}

function records<T>(value: WorldRuntime, id: string, component: string): T[] {
  return (value.store.readComponent<{ records: T[] }>(id, component) as { records: T[] }).records;
}

function balance(value: WorldRuntime, id: string): number {
  const ledger = value.store.readComponent<{ accounts: Array<{ id: string; balance: number }> }>(
    'ledger:points',
    'ledger',
  ) as { accounts: Array<{ id: string; balance: number }> };
  return ledger.accounts.find((entry) => entry.id === id)?.balance as number;
}

interface OutcomeItem {
  actorId: string;
  actionEntityId: string;
  mode: string;
}
interface OutcomeBatch {
  id: string;
  state: string;
  items: OutcomeItem[];
}
interface SettlementTransfer {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
}
interface SettlementBatch {
  id: string;
  state: string;
  proposalKeys: string[];
  transfers: SettlementTransfer[];
}

function interpret(value: WorldRuntime, actorId: string, attemptId: string, batchId: string, itemKeyValue: string) {
  return act(value, attemptId, actorId, 'pipeline.interpret-outcome-item', { batchId, itemKey: itemKeyValue });
}
function compose(value: WorldRuntime, actorId: string, attemptId: string, batchIdValue: string) {
  return act(value, attemptId, actorId, 'pipeline.compose-settlement', { batchId: batchIdValue });
}
function commit(value: WorldRuntime, actorId: string, attemptId: string, batchIdValue: string) {
  return act(value, attemptId, actorId, 'pipeline.commit-settlement', { batchId: batchIdValue });
}

describe('generic settlement over declarative continuing outcomes', () => {
  it('interprets multi-selection items, composes resolver order, and commits atomically', () => {
    const { value, ids, profile } = setup({ singlePayerAmount: 2000 });
    declare(value, ids.tripletIds);
    discard(value, 'east-discard', 'east', ids.initialDrawId);
    const window = value.openResponseWindows()[0];
    respond(value, 'south-ron', 'south', 'turbo-riichi.win', window.id);
    respond(value, 'west-ron', 'west', 'turbo-riichi.win', window.id);
    respond(value, 'north-pass', 'north', 'response.pass', window.id);

    const outcome = records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0];
    expect(outcome.items.map((item) => item.actorId)).toEqual(['south', 'west']);
    expect(act(value, 'draw-before-settlement', 'south', 'draw').outcome).toBe('rejected');
    expect(interpret(value, 'south', 'wrong-actor', outcome.id, outcome.items[0].actionEntityId).outcome).toBe('rejected');

    expect(interpret(value, profile.systemActorId, 'interpret-west', outcome.id, outcome.items[1].actionEntityId).outcome).toBe('executed');
    expect(interpret(value, profile.systemActorId, 'interpret-south', outcome.id, outcome.items[0].actionEntityId).outcome).toBe('executed');
    expect(compose(value, profile.systemActorId, 'compose', outcome.id).outcome).toBe('executed');

    const settlement = records<SettlementBatch>(value, 'track:settlement-batches', 'settlementBatches')[0];
    expect(settlement.proposalKeys).toEqual(outcome.items.map((item) => item.actionEntityId));
    expect(settlement.transfers.map((transfer) => `${transfer.fromAccountId}->${transfer.toAccountId}`)).toEqual([
      'east->south', 'east->west',
    ]);
    expect(commit(value, profile.systemActorId, 'commit', outcome.id).outcome).toBe('executed');
    expect(balance(value, 'east')).toBe(20000);
    expect(balance(value, 'south')).toBe(27000);
    expect(balance(value, 'west')).toBe(27000);
    expect(records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0].state).toBe('consumed');
    expect(records<SettlementBatch>(value, 'track:settlement-batches', 'settlementBatches')[0].state).toBe('committed');
    expect(act(value, 'south-draw', 'south', 'draw').outcome).toBe('executed');
  });

  it('rejects aggregate overdraft without partial balances or lifecycle changes', () => {
    const { value, ids, profile } = setup({ startingPoints: 5000, singlePayerAmount: 3000 });
    declare(value, ids.tripletIds);
    discard(value, 'east-discard', 'east', ids.initialDrawId);
    const window = value.openResponseWindows()[0];
    respond(value, 'south-ron', 'south', 'turbo-riichi.win', window.id);
    respond(value, 'west-ron', 'west', 'turbo-riichi.win', window.id);
    respond(value, 'north-pass', 'north', 'response.pass', window.id);
    const outcome = records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0];
    for (const [index, item] of outcome.items.entries()) {
      expect(interpret(value, profile.systemActorId, `interpret-${index}`, outcome.id, item.actionEntityId).outcome).toBe('executed');
    }
    expect(compose(value, profile.systemActorId, 'compose', outcome.id).outcome).toBe('executed');

    expect(balance(value, 'east')).toBe(4000);
    expect(commit(value, profile.systemActorId, 'commit-overdraft', outcome.id).outcome).toBe('rejected');
    expect(balance(value, 'east')).toBe(4000);
    expect(balance(value, 'south')).toBe(5000);
    expect(balance(value, 'west')).toBe(5000);
    expect(records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0].state).toBe('ready');
    expect(records<SettlementBatch>(value, 'track:settlement-batches', 'settlementBatches')[0].state).toBe('ready');
    expect(records(value, 'track:settlement-transactions', 'settlementTransactions')).toHaveLength(0);
  });

  it('routes a direct outcome through the same one-item settlement pipeline', () => {
    const { value, ids, profile } = setup({ sharedPayerAmount: 1000 });
    declare(value, ids.tripletIds);
    discard(value, 'east-discard', 'east', ids.initialDrawId);
    const firstWindow = value.openResponseWindows()[0];
    respond(value, 'south-pass', 'south', 'response.pass', firstWindow.id);
    respond(value, 'west-pass', 'west', 'response.pass', firstWindow.id);
    respond(value, 'north-pass', 'north', 'response.pass', firstWindow.id);
    expect(act(value, 'south-draw', 'south', 'draw').outcome).toBe('executed');
    expect(act(value, 'south-tsumo', 'south', 'turbo-riichi.self-win').outcome).toBe('executed');
    expect(discard(value, 'blocked-discard', 'south', ids.firstWallTileId).outcome).toBe('rejected');

    const outcome = records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0];
    interpret(value, profile.systemActorId, 'interpret-direct', outcome.id, outcome.items[0].actionEntityId);
    compose(value, profile.systemActorId, 'compose-direct', outcome.id);
    const settlement = records<SettlementBatch>(value, 'track:settlement-batches', 'settlementBatches')[0];
    expect(settlement.transfers.map((transfer) => transfer.fromAccountId).sort()).toEqual(['east', 'north', 'west']);
    expect(commit(value, profile.systemActorId, 'commit-direct', outcome.id).outcome).toBe('executed');
    expect(balance(value, 'south')).toBe(28000);
    expect(balance(value, 'east')).toBe(23000);
    expect(balance(value, 'west')).toBe(24000);
    expect(balance(value, 'north')).toBe(24000);
    expect(discard(value, 'south-tsumogiri', 'south', ids.firstWallTileId).outcome).toBe('executed');
  });
});
