import { describe, expect, it } from 'vitest';
import { compileWorld } from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import {
  createSettledTurboRiichiFixture,
  type TurboRiichiSeat,
} from '../src/turboSettlementLayer.js';

const NEXT: Record<TurboRiichiSeat, TurboRiichiSeat> = {
  east: 'south', south: 'west', west: 'north', north: 'east',
};

function setup(options: Parameters<typeof createSettledTurboRiichiFixture>[0] = {}) {
  const fixture = createSettledTurboRiichiFixture(options);
  const value = new WorldRuntime(compileWorld(fixture.source));
  value.start();
  return { fixture, value };
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
  itemKey: string,
) {
  return act(value, attemptId, actorId, 'pipeline.interpret-outcome-item', { batchId, itemKey });
}

function compose(value: WorldRuntime, actorId: string, attemptId: string, batchId: string) {
  return act(value, attemptId, actorId, 'pipeline.compose-settlement', { batchId });
}

function commit(value: WorldRuntime, actorId: string, attemptId: string, batchId: string) {
  return act(value, attemptId, actorId, 'pipeline.commit-settlement', { batchId });
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
  const record = value as Record<string, unknown>;
  if (typeof record.kind === 'string') output.push(record.kind);
  Object.values(record).forEach((entry) => collectKinds(entry, output));
  return output;
}

describe('modular outcome interpretation and settlement', () => {
  it('interprets multi-ron items, composes ordered transfers, and commits atomically', () => {
    const { fixture, value } = setup({ ronPayment: 2000 });
    const engine = fixture.policy.settlementActorId;
    expect(declare(value, fixture.ids.tripletIds).outcome).toBe('executed');
    expect(discard(value, 'east-discard', 'east', fixture.ids.initialDrawId).outcome).toBe('executed');
    const window = value.openResponseWindows()[0];

    expect(respond(value, 'south-ron', 'south', 'turbo-riichi.win', window.id).outcome).toBe('executed');
    expect(respond(value, 'west-ron', 'west', 'turbo-riichi.win', window.id).outcome).toBe('executed');
    expect(respond(value, 'north-pass', 'north', 'response.pass', window.id).outcome).toBe('executed');

    const outcome = records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0];
    expect(outcome.id).toBe(window.id);
    expect(outcome.state).toBe('ready');
    expect(outcome.items.map((item) => item.actorId)).toEqual(['south', 'west']);
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
    expect(settlement.proposalKeys).toEqual(outcome.items.map((item) => item.actionEntityId));
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
    const { fixture, value } = setup({ startingPoints: 5000, ronPayment: 3000 });
    const engine = fixture.policy.settlementActorId;
    declare(value, fixture.ids.tripletIds);
    discard(value, 'east-discard', 'east', fixture.ids.initialDrawId);
    const window = value.openResponseWindows()[0];
    respond(value, 'south-ron', 'south', 'turbo-riichi.win', window.id);
    respond(value, 'west-ron', 'west', 'turbo-riichi.win', window.id);
    respond(value, 'north-pass', 'north', 'response.pass', window.id);
    const outcome = records<OutcomeBatch>(value, 'track:outcome-batches', 'outcomeBatches')[0];
    for (const [index, item] of outcome.items.entries()) {
      expect(interpret(value, engine, `interpret-${index}`, outcome.id, item.actionEntityId).outcome).toBe('executed');
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

  it('routes a continuing self-win through the same one-item settlement pipeline', () => {
    const { fixture, value } = setup({ tsumoPaymentEach: 1000 });
    const engine = fixture.policy.settlementActorId;
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

  it('uses only the frozen calculus vocabulary', () => {
    const fixture = createSettledTurboRiichiFixture();
    const kinds = collectKinds(fixture.source.corePrograms);
    expect(kinds.filter((kind) => !CORE_KINDS.has(kind))).toEqual([]);
  });
});
