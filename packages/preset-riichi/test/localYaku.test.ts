import { describe, expect, it } from 'vitest';
import { reduceEvents, solveFiniteDomain, type FiniteDomainProgram } from '@mahjongplus/world-calculus';
import {
  instantiateRuleModule,
  validateRuleModuleDefinition,
  type RuleModuleDefinition,
  type WorldSource,
} from '@mahjongplus/world-language';
import {
  LOCAL_YAKU_MODULES,
  type LocalYakuModuleArtifacts,
} from '../src/localYaku.js';

const EMPTY_WORLD: WorldSource = {
  schemaVersion: 'mwl/0.6',
  id: 'fixture:empty-rule-module-world',
  entities: [],
  zones: [],
  relations: [],
  actions: [],
  procedures: [],
  responseWindows: [],
  corePrograms: { constraints: [], reducers: [], rewrites: [] },
  bootstrap: [],
};

function definition(id: string): RuleModuleDefinition {
  const value = LOCAL_YAKU_MODULES.find((entry) => entry.id === id);
  if (!value) throw new Error(`Missing module ${id}.`);
  return value;
}

function artifacts(id: string, parameters: Record<string, unknown> = {}): LocalYakuModuleArtifacts {
  return instantiateRuleModule(EMPTY_WORLD, {
    definition: definition(id),
    parameters,
  }).artifacts as unknown as LocalYakuModuleArtifacts;
}

function matched(program: FiniteDomainProgram, variables: Record<string, unknown>): boolean {
  return solveFiniteDomain(program, { variables }).satisfiable;
}

function tiles(suit: string, ranks: number[], prefix = suit) {
  return ranks.map((rank, index) => ({
    id: `${prefix}:${rank}:${index}`,
    face: `${suit}${rank}`,
    suit,
    rank,
    numeric: suit !== 'z',
    terminalOrHonor: suit === 'z' || rank === 1 || rank === 9,
  }));
}

describe('local yaku as declarative Mahjong-language modules', () => {
  it('matches open nine gates without a rule-specific constructor', () => {
    const value = artifacts('local.open-nine-gates', { han: 2 });
    const hand = tiles('m', [1, 1, 1, 2, 3, 4, 5, 5, 6, 7, 8, 9, 9, 9]);
    expect(matched(value.eligibility, {
      hand, targetSuit: 'm', closed: false, winAccepted: true,
    })).toBe(true);
    expect(matched(value.eligibility, {
      hand, targetSuit: 'm', closed: true, winAccepted: true,
    })).toBe(false);
    expect(value.award.contributions).toContainEqual({ dimension: 'han', operation: 'add', value: 2 });
  });

  it('matches the low-sum manzu flush through module parameters', () => {
    const value = artifacts('local.low-sum-manzu-flush', { maxRankSum: 35, han: 13 });
    const low = tiles('m', [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
    const high = tiles('m', [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 9]);
    expect(matched(value.eligibility, { hand: low, winAccepted: true })).toBe(true);
    expect(matched(value.eligibility, { hand: high, winAccepted: true })).toBe(false);
    expect(matched(value.eligibility, {
      hand: [...low.slice(0, 13), ...tiles('p', [1], 'p')], winAccepted: true,
    })).toBe(false);
  });

  it('parameterizes whether the temporal rule accepts a river-bottom result', () => {
    const events = [{ index: 0, type: 'double-riichi.committed', actorId: 'east' }];
    const win = { index: 20, actorId: 'east', closed: true, context: 'last-live-wall-discard' };
    expect(matched(artifacts('local.stone-on-three-years', {
      allowRiverBottom: true,
      han: 13,
    }).eligibility, { events, win, winAccepted: true })).toBe(true);
    expect(matched(artifacts('local.stone-on-three-years', {
      allowRiverBottom: false,
      han: 13,
    }).eligibility, { events, win, winAccepted: true })).toBe(false);
    expect(matched(artifacts('local.stone-on-three-years').eligibility, {
      events: [...events, { index: 10, type: 'riichi.cancelled', actorId: 'east' }],
      win,
      winAccepted: true,
    })).toBe(false);
  });

  it('describes thirteen misfits with pair counts and forbidden pairwise distances', () => {
    const value = artifacts('local.thirteen-misfits');
    const hand = [
      ...tiles('m', [1, 6, 9], 'm'),
      ...tiles('s', [2, 5], 's'),
      ...tiles('p', [1, 4, 8, 8], 'p'),
      ...tiles('z', [1, 2, 4, 5, 7], 'z'),
    ];
    expect(hand).toHaveLength(14);
    expect(matched(value.eligibility, {
      hand, dealer: true, phase: 'after-deal', callCount: 0, winAccepted: true,
    })).toBe(true);

    const taatsu = hand.map((tile) => ({ ...tile }));
    const p4 = taatsu.find((tile) => tile.face === 'p4');
    if (!p4) throw new Error('test tile missing');
    p4.face = 'p3';
    p4.rank = 3;
    expect(matched(value.eligibility, {
      hand: taatsu, dealer: true, phase: 'after-deal', callCount: 0, winAccepted: true,
    })).toBe(false);
    expect(matched(value.eligibility, {
      hand, dealer: false, phase: 'after-first-draw', callCount: 1, winAccepted: true,
    })).toBe(false);
  });

  it('expresses eight consecutive wins through a reducer and parameterized threshold rule', () => {
    const strict = artifacts('local.eight-consecutive-wins', {
      trackedPlayerId: 'east',
      resetOnDraw: true,
      requireIndependentYaku: true,
    });
    if (!strict.reducer) throw new Error('reducer missing');
    const wins = Array.from({ length: 8 }, (_, index) => ({
      index,
      type: 'hand.ended',
      winnerId: 'east',
    }));
    const reduced = reduceEvents(strict.reducer, wins, {});
    expect(reduced.state).toEqual({ count: 8 });
    expect(matched(strict.eligibility, { streak: reduced.state, ordinaryHan: 1 })).toBe(true);
    expect(matched(strict.eligibility, { streak: reduced.state, ordinaryHan: 0 })).toBe(false);

    const permissive = artifacts('local.eight-consecutive-wins', {
      trackedPlayerId: 'east',
      resetOnDraw: true,
      requireIndependentYaku: false,
    });
    expect(matched(permissive.eligibility, { streak: reduced.state, ordinaryHan: 0 })).toBe(true);

    const withDraw = [...wins.slice(0, 4), { index: 4, type: 'hand.drawn', winnerId: null }, ...wins.slice(4)];
    expect(reduceEvents(strict.reducer, withDraw, {}).state).toEqual({ count: 4 });
  });

  it('is JSON-round-trippable and contains no concrete rule functions', () => {
    for (const module of LOCAL_YAKU_MODULES) {
      expect(validateRuleModuleDefinition(module)).toEqual([]);
      const roundTrip = JSON.parse(JSON.stringify(module)) as RuleModuleDefinition;
      expect(validateRuleModuleDefinition(roundTrip)).toEqual([]);
      expect(instantiateRuleModule(EMPTY_WORLD, { definition: roundTrip }).manifest.hash)
        .toBe(instantiateRuleModule(EMPTY_WORLD, { definition: module }).manifest.hash);
    }
    const moduleSource = JSON.stringify(LOCAL_YAKU_MODULES);
    expect(moduleSource).not.toContain('function');
  });

  it('keeps all module artifacts inside the frozen expression vocabulary', () => {
    const allowedKinds = new Set([
      'literal', 'variable', 'path', 'list', 'record', 'if', 'arithmetic',
      'filter', 'map', 'concat', 'flatten', 'distinct', 'aggregate',
      'boolean', 'not', 'all', 'any', 'compare', 'contains', 'quantify',
    ]);
    const kinds = new Set<string>();
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (typeof record.kind === 'string') kinds.add(record.kind);
      Object.values(record).forEach(visit);
    };
    LOCAL_YAKU_MODULES.forEach((module) => visit(instantiateRuleModule(EMPTY_WORLD, { definition: module }).artifacts));
    expect([...kinds].filter((kind) => !allowedKinds.has(kind))).toEqual([]);
  });
});
