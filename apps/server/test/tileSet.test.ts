import { describe, expect, it } from 'vitest';
import { DeterministicRandom } from '../src/kernel/random.js';
import { SeededShan } from '../src/kernel/seededShan.js';
import { createStandardTileSet, expandTileSet } from '../src/kernel/tileSet.js';

describe('modular physical tile sets', () => {
  it('supports more than four copies and multiple red fives', () => {
    const definition = createStandardTileSet({ redFives: { m: 3, p: 2, s: 1 }, extraCopies: { m1: 2, z5: 1 } });
    const tiles = expandTileSet(definition);
    expect(tiles.filter((tile) => tile === 'm1')).toHaveLength(6); expect(tiles.filter((tile) => tile === 'm0')).toHaveLength(3); expect(tiles.filter((tile) => tile === 'm5')).toHaveLength(1); expect(tiles.filter((tile) => tile === 'z5')).toHaveLength(5);
  });
  it('creates reproducible walls from named random streams', () => {
    const definition = createStandardTileSet(); const rule = { '裏ドラあり': true, 'カンドラあり': true, 'カン裏あり': true };
    const first = new SeededShan(rule, definition, new DeterministicRandom('same-seed')); const second = new SeededShan(rule, definition, new DeterministicRandom('same-seed'));
    expect(Array.from({ length: 20 }, () => first.zimo())).toEqual(Array.from({ length: 20 }, () => second.zimo()));
  });
});
