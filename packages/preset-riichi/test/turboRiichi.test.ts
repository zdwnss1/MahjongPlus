import { describe, expect, it } from 'vitest';
import {
  compileWorld,
  composeWorldModules,
  validateDataAgainstSchema,
  validateRuleModuleDefinition,
  type DataSchema,
} from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
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
  proofFace?: 'm7' | 'p7' | 's7';
  declarerId?: Seat;
  stake?: number;
  riichiHan?: number;
  maxWinsPerPlayer?: number | null;
  startingPoints?: number;
  wallTileCount?: number;
}

function filler(seat: Seat, count: number): PhysicalTileSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tile:${seat}:filler:${index}`,
    face: `${['m', 'p', 's'][index % 3]}${(index % 9) + 1}`,
  }));
}

function setup(options: SetupOptions = {}) {
  const proofFace = options.proofFace ?? 'm7';
  const declarerId = options.declarerId ?? 'east';
  const tripletIds = Array.from({ length: 3 }, (_, index) => `tile:${declarerId}:${proofFace}:${index}`);
  const initialDrawId = `tile:${declarerId}:initial-draw`;
  const wallTileCount = options.wallTileCount ?? 8;
  const wall: PhysicalTileSpec[] = Array.from({ length: wallTileCount }, (_, index) => ({
    id: `tile:wall:${index}`,
    face: index === 0 ? 's9' : `p${(index % 9) + 1}`,
  }));
  const hands = Object.fromEntries(SEATS.map((seat) => [
    seat,
    seat === declarerId
      ? [
          ...tripletIds.map((id) => ({ id, face: proofFace })),
          ...filler(seat, 10),
          { id: initialDrawId, face: 'p5' },
        ]
      : filler(seat, 13),
  ])) as Record<Seat, PhysicalTileSpec[]>;
  const firstWallTileId = wall[0].id;
  const base = buildTurnWorldFixture({
    seats: SEATS,
    initialOwnerId: declarerId,
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
    tileId: subjectId === declarerId ? initialDrawId : null,
    exposureId: subjectId === declarerId ? `initial-exposure:${declarerId}` : null,
  }));
  const composed = composeWorldModules(base.source, [
    {
      definition: TURBO_DECLARATION_MODULE,
      parameters: {
        declarerId,
        stake: options.stake ?? 1000,
        riichiHan: options.riichiHan ?? 1,
      },
      bindings: {
        ledgerId: base.bindings.ledgerId,
        playerIds: base.bindings.playerIds,
        turnProcedureId: base.bindings.turnProcedureId,
        awaitDiscardNodeId: base.bindings.awaitDiscardNodeId,
      },
    },
    {
      definition: CONTINUING_WIN_FLOW_MODULE,
      parameters: {
        maxWinsPerPlayer: options.maxWinsPerPlayer ?? 0,
      },
      bindings: {
        ...base.bindings,
        initialDraws,
        discardPolicyTrackId: 'track:discard-policies',
      },
    },
  ]);
  const declarationArtifacts = composed.artifacts[TURBO_DECLARATION_MODULE.id] as {
    inputSchema: DataSchema;
  };
  const value = new WorldRuntime(compileWorld(composed.world));
  value.start();
  return {
    fixture: {
      source: composed.world,
      manifest: composed.manifest,
      declarationInputSchema: declarationArtifacts.inputSchema,
      ids: { tripletIds, initialDrawId, firstWallTileId },
    },
    value,
  };
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

function discard(value: WorldRuntime, attemptId: string, actorId: Seat, tileId: string) {
  return act(value, attemptId, actorId, 'discard', { tileId, nextActorId: NEXT[actorId] });
}

function openWindow(value: WorldRuntime) {
  return value.openResponseWindows()[0];
}

function respond(value: WorldRuntime, attemptId: string, actorId: string, actionId: string) {
  const window = openWindow(value);
  return act(value, attemptId, actorId, actionId, { windowId: window.id });
}

function track<T>(value: WorldRuntime, id: string, component: string): T {
  return value.store.readComponent<T>(id, component) as T;
}

function wins(value: WorldRuntime) {
  return track<{ records: Array<{ winnerId: string; tileId: string; exposureId: string; mode: string }> }>(
    value,
    'track:wins',
    'wins',
  ).records;
}

function responseBatches(value: WorldRuntime) {
  return track<{
    records: Array<{
      id: string;
      kind: string;
      sourceWindowId: string;
      items: Array<{ actorId: string; actionId: string; actionEntityId: string }>;
      processedKeys: string[];
      state: string;
      metadata: Record<string, unknown>;
    }>;
  }>(value, 'track:response-batches', 'responseBatches').records;
}

function balance(value: WorldRuntime, id: string): number {
  const ledger = value.store.readComponent<{ accounts: Array<{ id: string; balance: number }> }>(
    'ledger:points',
    'ledger',
  ) as { accounts: Array<{ id: string; balance: number }> };
  return ledger.accounts.find((entry) => entry.id === id)?.balance as number;
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

describe('declarative disclosure and continuing-win modules', () => {
  it('requires and publicly reveals an exact concealed seven triplet without moving it', () => {
    const { fixture, value } = setup({ proofFace: 'p7' });
    expect(validateDataAgainstSchema(fixture.declarationInputSchema, { tileIds: fixture.ids.tripletIds })).toEqual([]);
    expect(validateDataAgainstSchema(
      fixture.declarationInputSchema,
      { tileIds: fixture.ids.tripletIds.slice(0, 2) },
    )[0]?.code).toBe('minItems');

    const bad = act(value, 'bad-declare', 'east', 'declare-turbo-riichi', {
      tileIds: [fixture.ids.tripletIds[0], fixture.ids.tripletIds[1], 'tile:east:filler:0'],
    });
    expect(bad.outcome).toBe('rejected');

    const receipt = declare(value, fixture.ids.tripletIds);
    expect(receipt.outcome).toBe('executed');
    expect(balance(value, 'east')).toBe(24000);
    expect(balance(value, 'riichi-pot')).toBe(1000);
    expect(fixture.ids.tripletIds.every((id) => value.store.zoneEntityIds('hand:east').includes(id))).toBe(true);

    const visibility = track<{ records: Array<{ entityId: string; audience: string; ownershipPreserved: boolean }> }>(
      value,
      'track:visibility',
      'visibility',
    ).records;
    expect(visibility.map((entry) => entry.entityId)).toEqual(fixture.ids.tripletIds);
    expect(visibility.every((entry) => entry.audience === 'all' && entry.ownershipPreserved)).toBe(true);
    expect(value.store.entitiesOfKind('meld')).toHaveLength(0);

    const policies = track<{ records: Array<{ subjectId: string; allowedSource: string; source: string }> }>(
      value,
      'track:discard-policies',
      'discardPolicies',
    ).records;
    expect(policies.map((entry) => entry.subjectId).sort()).toEqual(['east', 'north', 'south', 'west']);
    expect(policies.find((entry) => entry.subjectId === 'east')?.source).toBe('riichi');
    expect(policies.filter((entry) => entry.subjectId !== 'east').every((entry) => entry.source === 'turbo-riichi')).toBe(true);

    const bundleTypes = new Set([
      'resource.transferred',
      'declaration.published',
      'score-contribution.granted',
      'discard-policy.activated',
      'furiten-policy.activated',
      'visibility.updated',
    ]);
    const events = value.journal.all().filter((event) => bundleTypes.has(event.type));
    expect(events).toHaveLength(bundleTypes.size);
    expect(new Set(events.map((event) => event.causedByActionId)).size).toBe(1);
  });

  it('gates optimistic continuation until the response window resolves', () => {
    const { fixture, value } = setup();
    declare(value, fixture.ids.tripletIds);
    expect(discard(value, 'east-tsumogiri', 'east', fixture.ids.initialDrawId).outcome).toBe('executed');

    expect(value.scheduler.find('turn', 'await-draw', 'south')).toBeDefined();
    const blocked = act(value, 'south-early-draw', 'south', 'draw');
    expect(blocked.outcome).toBe('rejected');
    expect(blocked.failures.map((failure) => failure.id)).toContain('draw.responses-complete');

    respond(value, 'south-pass', 'south', 'response.pass');
    respond(value, 'west-pass', 'west', 'response.pass');
    respond(value, 'north-pass', 'north', 'response.pass');
    expect(act(value, 'south-draw', 'south', 'draw').outcome).toBe('executed');
    expect(responseBatches(value)).toEqual([]);
  });

  it('forces tsumogiri and records simultaneous wins as one ready batch without ending the hand', () => {
    const { fixture, value } = setup();
    expect(declare(value, fixture.ids.tripletIds).outcome).toBe('executed');

    expect(discard(value, 'east-hand-discard', 'east', 'tile:east:filler:0').outcome).toBe('rejected');
    expect(discard(value, 'east-tsumogiri', 'east', fixture.ids.initialDrawId).outcome).toBe('executed');
    const windowId = openWindow(value).id;
    expect(respond(value, 'south-ron', 'south', 'turbo-riichi.win').outcome).toBe('executed');
    expect(respond(value, 'west-ron', 'west', 'turbo-riichi.win').outcome).toBe('executed');
    expect(respond(value, 'north-pass', 'north', 'response.pass').outcome).toBe('executed');

    expect(wins(value).map((entry) => entry.winnerId)).toEqual(['south', 'west']);
    const batches = responseBatches(value);
    expect(batches).toHaveLength(1);
    expect(batches[0].id).toBe(windowId);
    expect(batches[0].kind).toBe('continuing-win');
    expect(batches[0].items.map((entry) => entry.actorId)).toEqual(['south', 'west']);
    expect(batches[0].processedKeys).toHaveLength(2);
    expect(new Set(batches[0].processedKeys).size).toBe(2);
    expect(batches[0].state).toBe('ready');
    expect(batches[0].metadata.continuingHand).toBe(true);

    expect(value.scheduler.find('turn', 'await-draw', 'south')).toBeDefined();
    expect(value.scheduler.find('turn', 'complete', 'south')).toBeUndefined();
    expect(value.journal.all().some((event) => event.type === 'hand.ended')).toBe(false);

    expect(act(value, 'south-draw', 'south', 'draw').outcome).toBe('executed');
    expect(act(value, 'south-tsumo', 'south', 'turbo-riichi.self-win').outcome).toBe('executed');
    expect(value.scheduler.find('turn', 'await-discard', 'south')).toBeDefined();
    expect(discard(value, 'south-hand-discard', 'south', 'tile:south:filler:0').outcome).toBe('rejected');
    expect(discard(value, 'south-tsumogiri', 'south', fixture.ids.firstWallTileId).outcome).toBe('executed');

    expect(respond(value, 'east-ron', 'east', 'turbo-riichi.win').outcome).toBe('executed');
    expect(respond(value, 'west-second-ron', 'west', 'turbo-riichi.win').outcome).toBe('executed');
    expect(respond(value, 'north-second-pass', 'north', 'response.pass').outcome).toBe('executed');
    expect(wins(value).map((entry) => `${entry.winnerId}:${entry.mode}`)).toEqual([
      'south:ron', 'west:ron', 'south:tsumo', 'west:ron', 'east:ron',
    ]);
    expect(responseBatches(value)).toHaveLength(2);
    expect(responseBatches(value).every((batch) => batch.state === 'ready')).toBe(true);
    expect(value.scheduler.find('turn', 'await-draw', 'west')).toBeDefined();
  });

  it('supports a per-player win limit without preventing other winners', () => {
    const { fixture, value } = setup({ maxWinsPerPlayer: 1 });
    declare(value, fixture.ids.tripletIds);
    discard(value, 'east-discard', 'east', fixture.ids.initialDrawId);
    respond(value, 'south-first', 'south', 'turbo-riichi.win');
    respond(value, 'west-first', 'west', 'turbo-riichi.win');
    respond(value, 'north-pass', 'north', 'response.pass');

    act(value, 'south-draw', 'south', 'draw');
    expect(act(value, 'south-second', 'south', 'turbo-riichi.self-win').outcome).toBe('rejected');
    discard(value, 'south-discard', 'south', fixture.ids.firstWallTileId);
    expect(respond(value, 'east-first', 'east', 'turbo-riichi.win').outcome).toBe('executed');
    expect(respond(value, 'west-over-limit', 'west', 'turbo-riichi.win').outcome).toBe('rejected');
    expect(respond(value, 'west-pass', 'west', 'response.pass').outcome).toBe('executed');
    expect(respond(value, 'north-pass-2', 'north', 'response.pass').outcome).toBe('executed');

    expect(wins(value).map((entry) => entry.winnerId)).toEqual(['south', 'west', 'east']);
  });

  it('ends only when the live wall is exhausted and no response window is open', () => {
    const { fixture, value } = setup({ wallTileCount: 1 });
    declare(value, fixture.ids.tripletIds);
    discard(value, 'east-discard', 'east', fixture.ids.initialDrawId);
    respond(value, 'south-pass', 'south', 'response.pass');
    respond(value, 'west-pass', 'west', 'response.pass');
    respond(value, 'north-pass', 'north', 'response.pass');

    expect(act(value, 'south-draw', 'south', 'draw').outcome).toBe('executed');
    expect(discard(value, 'south-discard', 'south', fixture.ids.firstWallTileId).outcome).toBe('executed');
    expect(act(value, 'early-end', 'west', 'end-exhaustive-draw').outcome).toBe('rejected');
    respond(value, 'east-pass', 'east', 'response.pass');
    respond(value, 'west-pass-2', 'west', 'response.pass');
    respond(value, 'north-pass-2', 'north', 'response.pass');

    expect(value.scheduler.find('turn', 'await-draw', 'west')).toBeDefined();
    expect(act(value, 'end-hand', 'west', 'end-exhaustive-draw').outcome).toBe('executed');
    expect(value.scheduler.find('turn', 'complete', 'west')).toBeDefined();
    expect(value.journal.all().filter((event) => event.type === 'hand.ended')).toHaveLength(1);
  });

  it('round-trips as JSON data and stays inside the frozen calculus vocabulary', () => {
    const declaration = JSON.parse(JSON.stringify(TURBO_DECLARATION_MODULE));
    const flow = JSON.parse(JSON.stringify(CONTINUING_WIN_FLOW_MODULE));
    expect(validateRuleModuleDefinition(declaration)).toEqual([]);
    expect(validateRuleModuleDefinition(flow)).toEqual([]);
    const fixture = setup().fixture;
    const repeated = setup().fixture;
    const kinds = collectKinds(fixture.source.corePrograms);
    expect(kinds.filter((kind) => !CORE_KINDS.has(kind))).toEqual([]);
    expect(fixture.manifest.hash).toMatch(/^[a-f0-9]{16}$/);
    expect(repeated.manifest.hash).toBe(fixture.manifest.hash);
  });
});
