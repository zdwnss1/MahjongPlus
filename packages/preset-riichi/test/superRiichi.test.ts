import { describe, expect, it } from 'vitest';
import {
  compileWorld,
  instantiateRuleModule,
  validateDataAgainstSchema,
  validateRuleModuleDefinition,
  type DataSchema,
} from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import { SUPER_RIICHI_MODULE } from '../src/superRiichiModule.js';
import { buildPhysicalFixture } from './physicalFixture.js';

interface ActionOfferArtifact {
  actionId: string;
  inputSchema: DataSchema;
  choices: Array<{ id: string; label: string; preview: Record<string, unknown> }>;
}

function runtime(parameters: Record<string, unknown> = {}) {
  const physical = buildPhysicalFixture();
  const result = instantiateRuleModule(physical.source, {
    definition: SUPER_RIICHI_MODULE,
    parameters,
    bindings: physical.bindings,
  });
  return {
    physical,
    result,
    offer: result.artifacts.actionOffer as ActionOfferArtifact,
    value: new WorldRuntime(compileWorld(result.world)),
  };
}

function attempt(value: WorldRuntime, attemptId: string, actorId: string, mode: string) {
  return value.attempt({
    attemptId,
    actorId,
    actionId: 'declare-riichi',
    observedRevision: value.currentRevision,
    parameters: { mode },
  });
}

function ledger(value: WorldRuntime) {
  return value.store.readComponent<{ accounts: Array<{ id: string; balance: number }> }>('ledger:points', 'ledger') as {
    accounts: Array<{ id: string; balance: number }>;
  };
}

function balance(value: WorldRuntime, id: string): number {
  return ledger(value).accounts.find((account) => account.id === id)?.balance as number;
}

function track(value: WorldRuntime) {
  return value.store.readComponent<{
    revealedCount: number;
    capacity: number;
    revealed: Array<{ tileId: string; audience: string; source: string }>;
    candidates: Array<{ tileId: string; ordinal: number }>;
    declaredActors: string[];
  }>('track:dora-indicators', 'revealTrack') as {
    revealedCount: number;
    capacity: number;
    revealed: Array<{ tileId: string; audience: string; source: string }>;
    candidates: Array<{ tileId: string; ordinal: number }>;
    declaredActors: string[];
  };
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

describe('Super riichi as declarative Mahjong-language data', () => {
  it('publishes a discoverable input contract and rejects unknown modes', () => {
    const { offer, value } = runtime();
    expect(validateDataAgainstSchema(offer.inputSchema, { mode: 'super' })).toEqual([]);
    expect(validateDataAgainstSchema(offer.inputSchema, { mode: 'ultra' })[0]?.code).toBe('enum');
    expect(validateDataAgainstSchema(offer.inputSchema, { mode: 'super', hidden: true })[0]?.code)
      .toBe('additionalProperties');

    const receipt = attempt(value, 'bad-mode', 'east', 'ultra');
    expect(receipt.outcome).toBe('rejected');
    expect(receipt.failures.map((failure) => failure.id)).toContain('declare-riichi.core-eligibility');
  });

  it('keeps standard mode available while restricting the enhanced mode to the module owner', () => {
    const ordinary = runtime({ scope: 'owner-only', ownerId: 'east' }).value;
    expect(attempt(ordinary, 'south-standard', 'south', 'standard').outcome).toBe('executed');
    expect(balance(ordinary, 'south')).toBe(24_000);
    expect(balance(ordinary, 'riichi-pot')).toBe(1_000);
    expect(track(ordinary).revealedCount).toBe(0);

    const restricted = runtime({ scope: 'owner-only', ownerId: 'east' }).value;
    expect(attempt(restricted, 'south-super', 'south', 'super').outcome).toBe('rejected');
    expect(attempt(restricted, 'east-super', 'east', 'super').outcome).toBe('executed');
    expect(balance(restricted, 'east')).toBe(20_000);
    expect(balance(restricted, 'riichi-pot')).toBe(5_000);
    expect(track(restricted).revealedCount).toBe(2);
  });

  it('supports a shared four-indicator cap without moving the wall boundary', () => {
    const { value } = runtime({ scope: 'global', indicatorPolicy: 'standard-cap' });
    const liveBefore = value.store.zoneEntityIds('wall.live');
    const deadBefore = value.store.zoneEntityIds('wall.dead');

    expect(attempt(value, 'east-super', 'east', 'super').outcome).toBe('executed');
    expect(attempt(value, 'south-super', 'south', 'super').outcome).toBe('executed');
    expect(attempt(value, 'west-super', 'west', 'super').outcome).toBe('rejected');

    const state = track(value);
    expect(state.revealedCount).toBe(4);
    expect(state.capacity).toBe(4);
    expect(state.revealed.map((entry) => entry.tileId)).toEqual(state.candidates.slice(0, 4).map((entry) => entry.tileId));
    expect(state.revealed.every((entry) => entry.audience === 'all')).toBe(true);
    expect(value.store.zoneEntityIds('wall.live')).toEqual(liveBefore);
    expect(value.store.zoneEntityIds('wall.dead')).toEqual(deadBefore);
    expect(balance(value, 'riichi-pot')).toBe(10_000);
  });

  it('supports unbounded indicators by shifting two physical stacks per declaration', () => {
    const { physical, value } = runtime({ scope: 'global', indicatorPolicy: 'unbounded-extend' });
    const initialLive = value.store.zoneEntityIds('wall.live');
    const initialDead = value.store.zoneEntityIds('wall.dead');

    expect(attempt(value, 'east-super', 'east', 'super').outcome).toBe('executed');
    expect(value.store.zoneEntityIds('wall.live')).toEqual(initialLive.slice(0, -4));
    expect(value.store.zoneEntityIds('wall.dead')).toEqual(initialLive.slice(-4).concat(initialDead));
    expect(track(value).revealed.map((entry) => entry.tileId)).toEqual([initialLive.at(-4), initialLive.at(-2)]);

    expect(attempt(value, 'south-super', 'south', 'super').outcome).toBe('executed');
    expect(attempt(value, 'west-super', 'west', 'super').outcome).toBe('executed');
    const state = track(value);
    expect(state.revealedCount).toBe(6);
    expect(state.revealed).toHaveLength(6);
    expect(value.store.zoneEntityIds('wall.live')).toHaveLength(physical.ids.liveTileIds.length - 12);
    expect(value.store.zoneEntityIds('wall.dead')).toHaveLength(physical.ids.deadTileIds.length + 12);
    expect(balance(value, 'riichi-pot')).toBe(15_000);

    const activeTiles = value.store.zoneEntityIds('wall.live').concat(value.store.zoneEntityIds('wall.dead'));
    expect(new Set(activeTiles).size).toBe(activeTiles.length);
  });

  it('is JSON-round-trippable and expands only to the frozen calculus vocabulary', () => {
    expect(validateRuleModuleDefinition(SUPER_RIICHI_MODULE)).toEqual([]);
    const roundTrip = JSON.parse(JSON.stringify(SUPER_RIICHI_MODULE));
    const result = instantiateRuleModule(buildPhysicalFixture().source, {
      definition: roundTrip,
      parameters: { indicatorPolicy: 'unbounded-extend' },
      bindings: buildPhysicalFixture().bindings,
    });
    const kinds = collectKinds(result.world.corePrograms);
    expect(kinds.filter((kind) => !CORE_KINDS.has(kind))).toEqual([]);
  });
});
