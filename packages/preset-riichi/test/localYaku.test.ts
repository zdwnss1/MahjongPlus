import { describe, expect, it } from 'vitest';
import { reduceEvents, solveFiniteDomain } from '@mahjongplus/world-calculus';
import {
  eightConsecutiveWinsFixture,
  localYakuFixtures,
  lowSumManzuFlushFixture,
  openNineGatesFixture,
  stoneOnThreeYearsFixture,
  thirteenMisfitsFixture,
} from '../src/localYaku.js';

function matched(program: ReturnType<typeof openNineGatesFixture>['eligibility'], variables: Record<string, unknown>): boolean {
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

describe('local yaku as closed-calculus data', () => {
  it('matches open nine gates without adding a hand-shape runtime primitive', () => {
    const fixture = openNineGatesFixture(2);
    const hand = tiles('m', [1, 1, 1, 2, 3, 4, 5, 5, 6, 7, 8, 9, 9, 9]);
    expect(matched(fixture.eligibility, {
      hand, targetSuit: 'm', closed: false, winAccepted: true,
    })).toBe(true);
    expect(matched(fixture.eligibility, {
      hand, targetSuit: 'm', closed: true, winAccepted: true,
    })).toBe(false);
    expect(fixture.award.contributions).toContainEqual({ dimension: 'han', operation: 'add', value: 2 });
  });

  it('matches the low-sum manzu flush through forall, map, sum and comparison', () => {
    const fixture = lowSumManzuFlushFixture(35, 13);
    const low = tiles('m', [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
    const high = tiles('m', [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 9]);
    expect(matched(fixture.eligibility, { hand: low, winAccepted: true })).toBe(true);
    expect(matched(fixture.eligibility, { hand: high, winAccepted: true })).toBe(false);
    expect(matched(fixture.eligibility, {
      hand: [...low.slice(0, 13), ...tiles('p', [1], 'p')], winAccepted: true,
    })).toBe(false);
  });

  it('parameterizes whether stone-on-three-years accepts river-bottom ron', () => {
    const events = [{
      index: 0,
      type: 'double-riichi.committed',
      actorId: 'east',
    }];
    const win = { index: 20, actorId: 'east', closed: true, context: 'last-live-wall-discard' };
    expect(matched(stoneOnThreeYearsFixture({ allowRiverBottom: true }).eligibility, {
      events, win, winAccepted: true,
    })).toBe(true);
    expect(matched(stoneOnThreeYearsFixture({ allowRiverBottom: false }).eligibility, {
      events, win, winAccepted: true,
    })).toBe(false);
    expect(matched(stoneOnThreeYearsFixture().eligibility, {
      events: [...events, { index: 10, type: 'riichi.cancelled', actorId: 'east' }],
      win,
      winAccepted: true,
    })).toBe(false);
  });

  it('describes thirteen misfits with pair counts and forbidden pairwise distances', () => {
    const fixture = thirteenMisfitsFixture();
    const hand = [
      ...tiles('m', [1, 6, 9], 'm'),
      ...tiles('s', [2, 5], 's'),
      ...tiles('p', [1, 4, 8, 8], 'p'),
      ...tiles('z', [1, 2, 4, 5, 7], 'z'),
    ];
    expect(hand).toHaveLength(14);
    expect(matched(fixture.eligibility, {
      hand, dealer: true, phase: 'after-deal', callCount: 0, winAccepted: true,
    })).toBe(true);

    const taatsu = hand.map((tile) => ({ ...tile }));
    const p4 = taatsu.find((tile) => tile.face === 'p4');
    if (!p4) throw new Error('test tile missing');
    p4.face = 'p3';
    p4.rank = 3;
    expect(matched(fixture.eligibility, {
      hand: taatsu, dealer: true, phase: 'after-deal', callCount: 0, winAccepted: true,
    })).toBe(false);
    expect(matched(fixture.eligibility, {
      hand, dealer: false, phase: 'after-first-draw', callCount: 1, winAccepted: true,
    })).toBe(false);
  });

  it('expresses eight consecutive wins as an event reducer plus a later threshold', () => {
    const strict = eightConsecutiveWinsFixture({ resetOnDraw: true, requireIndependentYaku: true });
    if (!strict.reducer) throw new Error('reducer missing');
    const wins = Array.from({ length: 8 }, (_, index) => ({
      index,
      type: 'hand.ended',
      winnerId: 'east',
    }));
    const reduced = reduceEvents(strict.reducer, wins, { trackedPlayer: 'east', resetOnDraw: true });
    expect(reduced.state).toEqual({ count: 8 });
    expect(matched(strict.eligibility, { streak: reduced.state, ordinaryHan: 1 })).toBe(true);
    expect(matched(strict.eligibility, { streak: reduced.state, ordinaryHan: 0 })).toBe(false);

    const permissive = eightConsecutiveWinsFixture({ requireIndependentYaku: false });
    expect(matched(permissive.eligibility, { streak: reduced.state, ordinaryHan: 0 })).toBe(true);

    const withDraw = [...wins.slice(0, 4), { index: 4, type: 'hand.drawn', winnerId: null }, ...wins.slice(4)];
    expect(reduceEvents(strict.reducer, withDraw, { trackedPlayer: 'east', resetOnDraw: true }).state)
      .toEqual({ count: 4 });
  });

  it('keeps the five fixtures inside the existing closed expression vocabulary', () => {
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
    localYakuFixtures().forEach(visit);
    expect([...kinds].filter((kind) => !allowedKinds.has(kind))).toEqual([]);
  });
});
