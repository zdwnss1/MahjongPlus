import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CoreExpression, CoreFormula } from '@mahjongplus/world-calculus';
import { compileWorld, createProgressBatchRewrite } from '@mahjongplus/world-language';
import type { EntityRecord } from '@mahjongplus/world-model';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import {
  appendWorldModuleEntities,
  composeOutcomeSettlementModule,
  createWorldEntityIndex,
} from '../src/outcomeSettlementModule.js';
import { compileOutcomeSettlementPrograms } from '../src/outcomeSettlementPrograms.js';
import { createTurboRiichiFixture } from '../src/turboRiichi.js';
import { createTurboRiichiModel } from '../src/turboRiichiModel.js';
import {
  TURBO_PLAYERS,
  type TurboRiichiOptions,
  type TurboRiichiSeat,
} from '../src/turboRiichiTypes.js';

const NEXT: Record<TurboRiichiSeat, TurboRiichiSeat> = {
  east: 'south', south: 'west', west: 'north', north: 'east',
};

interface SettlementFixtureOptions extends TurboRiichiOptions {
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

function settledSource(options: SettlementFixtureOptions = {}) {
  const {
    singlePayerAmount = 2000,
    sharedPayerAmount = 1000,
    minimumBalance = 0,
    systemActorId = 'system:settlement',
    ...ruleOptions
  } = options;
  const base = createTurboRiichiFixture(ruleOptions);
  const model = createTurboRiichiModel(ruleOptions);
  const storageEntities: EntityRecord[] = [
    { id: systemActorId, kind: 'system-actor', components: { systemRole: { role: 'outcome-settlement' } } },
    factTrack('track:outcome-batches', 'outcomeBatches'),
    factTrack('track:interpretation-proposals', 'interpretationProposals'),
    factTrack('track:interpretation-batches', 'interpretationBatches'),
    factTrack('track:settlement-batches', 'settlementBatches'),
    factTrack('track:settlement-transactions', 'settlementTransactions'),
  ];
  const sourceWithStorage = appendWorldModuleEntities(base.source, storageEntities);
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
      'world',
      'entities',
      entityIndex('track:outcome-batches'),
      'components',
      'outcomeBatches',
      'records',
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
  const latestDraws = path(variable('reducers'), 'turbo-riichi.latest-draw', 'latestDraws');
  const actorDraw = path(filter(
    latestDraws,
    'draw',
    compare('eq', path(variable('draw'), 'subjectId'), variable('actorId')),
  ), '0');
  const directOutcome = createProgressBatchRewrite({
    id: 'fixture.outcome.direct',
    batchesPath: [
      'world',
      'entities',
      entityIndex('track:outcome-batches'),
      'components',
      'outcomeBatches',
      'records',
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
    literal(TURBO_PLAYERS),
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
          anchorProgramId: 'turbo-riichi.collect-response-batch',
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
  return {
    fixture: { ...base, source },
    model,
    profile: { singlePayerAmount, sharedPayerAmount, minimumBalance, systemActorId },
  };
}

function setup(options: SettlementFixtureOptions = {}) {
  const { fixture, model, profile } = settledSource(options);
  const value = new WorldRuntime(compileWorld(fixture.source));
  value.start();
  return { fixture, model, profile, value };
}

function act(
  value: WorldRuntime,
  attemptId: string,
  actorId: string,
  actionId: string,
  parameters: Record<string, unknown> = {},
) {
  return value.attempt({
    attemptId,
    actorId,
    actionId,
    observedRevision: value.currentRevision,
    parameters,
  });
}

function declare(value: WorldRuntime, tileIds: string[]) {
  return act(value, 'declare', 'east', 'declare-turbo-riichi', { tileIds });
}

function discard(value: WorldRuntime, attemptId: string, actorId: TurboRiichiSeat, tileId: string) {
  return act(value, attemptId, actorId, 'discard', { tileId, nextActorId: NEXT[actorId] });
}

function respond(value: WorldRuntime, attemptId: string, actorId: string, actionId: string, windowId: string) {
  return act(value, attemptId, actorId, actionId, { windowId });
}

function track<T>(value: WorldRuntime, id: string, component: string): T {
  return value.store.readComponent<T>(id, component) as T;
}

function records<T>(value: WorldRuntime, id: string, component: string): T[] {
  return track<{ records: T[] }>(value, id, component).records;
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
  processedKeys: string[];
}

interface InterpretationBatch {
  id: string;
  state: string;
  processedKeys: string[];
}

interface SettlementTransfer {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
}

interface SettlementBatch {
  id: string;
  sourceBatchId: string;
  state: string;
  proposalKeys: string[];
  transfers: SettlementTransfer[];
}

function interpret(
  value: WorldRuntime,
  actorId: string,
  attemptId: string,
  batchId: string,
  itemKeyValue: string,
) {
  return act(value, attemptId, actorId, 'pipeline.interpret-outcome-item', { batchId, itemKey: itemKeyValue });
}

function compose(value: WorldRuntime, actorId: string, attemptId: string, batchIdValue: string) {
  return act(value, attemptId, actorId, 'pipeline.compose-settlement', { batchId: batchIdValue });
}

function commit(value: WorldRuntime, actorId: string, attemptId: string, batchIdValue: string) {
  return act(value, attemptId, actorId, 'pipeline.commit-settlement', { batchId: batchIdValue });
}

const CORE_KINDS = new Set([
  'literal', 'variable', 'path', 'list', 'record', 'if', 'arithmetic',
  'filter', 'map', 'concat', 'flatten', 'distinct', 'aggregate',
  'boolean', 'not', 'all', 'any', 'compare', 'contains', 'quantify',
  'set', 'delete', 'append', 'remove-where',
]);

function collectKinds(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKinds(entry, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const valueRecord = value as Record<string, unknown>;
  if (typeof valueRecord.kind === 'string') output.push(valueRecord.kind);
  Object.values(valueRecord).forEach((entry) => collectKinds(entry, output));
  return output;
}

describe('modular outcome interpretation and settlement', () => {
  it('interprets multiple items, composes ordered transfers, and commits atomically', () => {
    const { fixture, profile, value } = setup({ singlePayerAmount: 2000 });
    const engine = profile.systemActorId;
    expect(declare(value, fixture.ids.tripletIds).outcome).toBe('executed');
    expect(discard(value, 'east-discard', 'east', fixture.ids.initialDrawId).outcome).toBe('executed');
    const window = value.openResponseWindows()[0];

    expect(respond(value, 'south-ron', 'south', 'turbo-riichi.win', window.id).outcome).toBe('executed');
    expect(respond(value, 'west-ron', 'west', 'turbo-riichi.win', window.id).outcome).toBe('executed');
    expect(respond(value, 'north-pass', 'north', 'response.pass', window.id).outcome).toBe('executed');

    const outcome = records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0];
    expect(outcome.id).toBe(window.id);
    expect(outcome.state).toBe('ready');
    expect(outcome.items.map((entry) => entry.actorId)).toEqual(['south', 'west']);
    expect(act(value, 'draw-before-settlement', 'south', 'draw').outcome).toBe('rejected');
    expect(interpret(value, 'south', 'wrong-actor', outcome.id, outcome.items[0].actionEntityId).outcome)
      .toBe('rejected');

    expect(interpret(value, engine, 'interpret-west', outcome.id, outcome.items[1].actionEntityId).outcome)
      .toBe('executed');
    expect(records<InterpretationBatch>(value, 'track:interpretation-batches', 'interpretationBatches')[0].state)
      .toBe('collecting');
    expect(interpret(value, engine, 'interpret-south', outcome.id, outcome.items[0].actionEntityId).outcome)
      .toBe('executed');
    const interpretationBatch = records<InterpretationBatch>(
      value,
      'track:interpretation-batches',
      'interpretationBatches',
    )[0];
    expect(interpretationBatch.state).toBe('ready');
    expect(new Set(interpretationBatch.processedKeys).size).toBe(2);
    expect(interpret(value, engine, 'interpret-south-again', outcome.id, outcome.items[0].actionEntityId).outcome)
      .toBe('rejected');

    expect(compose(value, engine, 'compose', outcome.id).outcome).toBe('executed');
    const settlement = records<SettlementBatch>(value, 'track:settlement-batches', 'settlementBatches')[0];
    expect(settlement.state).toBe('ready');
    expect(settlement.proposalKeys).toEqual(outcome.items.map((entry) => entry.actionEntityId));
    expect(settlement.transfers.map((transfer) => `${transfer.fromAccountId}->${transfer.toAccountId}`)).toEqual([
      'east->south',
      'east->west',
    ]);
    expect(balance(value, 'east')).toBe(24000);
    expect(balance(value, 'south')).toBe(25000);
    expect(balance(value, 'west')).toBe(25000);

    expect(commit(value, engine, 'commit', outcome.id).outcome).toBe('executed');
    expect(balance(value, 'east')).toBe(20000);
    expect(balance(value, 'south')).toBe(27000);
    expect(balance(value, 'west')).toBe(27000);
    expect(balance(value, 'riichi-pot')).toBe(1000);
    expect(records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0].state).toBe('consumed');
    expect(records<SettlementBatch>(value, 'track:settlement-batches', 'settlementBatches')[0].state).toBe('committed');
    expect(records(value, 'track:settlement-transactions', 'settlementTransactions')).toHaveLength(1);
    expect(commit(value, engine, 'commit-again', outcome.id).outcome).toBe('rejected');
    expect(act(value, 'south-draw', 'south', 'draw').outcome).toBe('executed');
  });

  it('rejects an aggregate overdraft without partially changing balances or lifecycle state', () => {
    const { fixture, profile, value } = setup({ startingPoints: 5000, singlePayerAmount: 3000 });
    const engine = profile.systemActorId;
    declare(value, fixture.ids.tripletIds);
    discard(value, 'east-discard', 'east', fixture.ids.initialDrawId);
    const window = value.openResponseWindows()[0];
    respond(value, 'south-ron', 'south', 'turbo-riichi.win', window.id);
    respond(value, 'west-ron', 'west', 'turbo-riichi.win', window.id);
    respond(value, 'north-pass', 'north', 'response.pass', window.id);
    const outcome = records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0];
    for (const [index, entry] of outcome.items.entries()) {
      expect(interpret(value, engine, `interpret-${index}`, outcome.id, entry.actionEntityId).outcome).toBe('executed');
    }
    expect(compose(value, engine, 'compose', outcome.id).outcome).toBe('executed');

    expect(balance(value, 'east')).toBe(4000);
    expect(commit(value, engine, 'commit-overdraft', outcome.id).outcome).toBe('rejected');
    expect(balance(value, 'east')).toBe(4000);
    expect(balance(value, 'south')).toBe(5000);
    expect(balance(value, 'west')).toBe(5000);
    expect(records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0].state).toBe('ready');
    expect(records<SettlementBatch>(value, 'track:settlement-batches', 'settlementBatches')[0].state).toBe('ready');
    expect(records(value, 'track:settlement-transactions', 'settlementTransactions')).toHaveLength(0);
    expect(act(value, 'blocked-draw', 'south', 'draw').outcome).toBe('rejected');
  });

  it('routes a one-item outcome through the same settlement pipeline', () => {
    const { fixture, profile, value } = setup({ sharedPayerAmount: 1000 });
    const engine = profile.systemActorId;
    declare(value, fixture.ids.tripletIds);
    discard(value, 'east-discard', 'east', fixture.ids.initialDrawId);
    const firstWindow = value.openResponseWindows()[0];
    respond(value, 'south-pass', 'south', 'response.pass', firstWindow.id);
    respond(value, 'west-pass', 'west', 'response.pass', firstWindow.id);
    respond(value, 'north-pass', 'north', 'response.pass', firstWindow.id);
    expect(act(value, 'south-draw', 'south', 'draw').outcome).toBe('executed');
    expect(act(value, 'south-tsumo', 'south', 'turbo-riichi.self-win').outcome).toBe('executed');
    expect(discard(value, 'blocked-discard', 'south', fixture.ids.firstWallTileId).outcome).toBe('rejected');

    const outcome = records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0];
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0].mode).toBe('tsumo');
    interpret(value, engine, 'interpret-tsumo', outcome.id, outcome.items[0].actionEntityId);
    compose(value, engine, 'compose-tsumo', outcome.id);
    const settlement = records<SettlementBatch>(value, 'track:settlement-batches', 'settlementBatches')[0];
    expect(settlement.transfers.map((transfer) => transfer.fromAccountId).sort()).toEqual(['east', 'north', 'west']);
    expect(commit(value, engine, 'commit-tsumo', outcome.id).outcome).toBe('executed');
    expect(balance(value, 'south')).toBe(28000);
    expect(balance(value, 'east')).toBe(23000);
    expect(balance(value, 'west')).toBe(24000);
    expect(balance(value, 'north')).toBe(24000);
    expect(discard(value, 'south-tsumogiri', 'south', fixture.ids.firstWallTileId).outcome).toBe('executed');
  });

  it('uses only the frozen calculus vocabulary and exposes no local-rule public functions', () => {
    const { fixture } = settledSource();
    const kinds = collectKinds(fixture.source.corePrograms);
    expect(kinds.filter((kind) => !CORE_KINDS.has(kind))).toEqual([]);

    const publicApi = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    expect(publicApi).not.toMatch(/turbo|super|nine.?gates|thirteen.?misfits|stone.?on/i);
    const genericSources = [
      readFileSync(new URL('../src/outcomeSettlementPrograms.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../src/outcomeSettlementModule.ts', import.meta.url), 'utf8'),
    ].join('\n');
    expect(genericSources).not.toMatch(/turbo|super|nine.?gates|thirteen.?misfits|stone.?on/i);
  });
});
