import { describe, expect, it } from 'vitest';
import { buildWallTopology, createDiceRoll, resolveWallOpening, STANDARD_WALL_POLICY } from '../src/kernel/wallTopology.js';

describe('physical wall topology', () => {
  it('builds the standard 17 stacks per side and resolves dice from the dealer', () => {
    const tiles = Array.from({ length: 136 }, (_, index) => `tile-${index}`);
    const topology = buildWallTopology(tiles, 'east', STANDARD_WALL_POLICY);
    expect(Object.values(topology.sides).map((side) => side.stacksFromRight.length)).toEqual([17, 17, 17, 17]);

    const opening = resolveWallOpening(topology, 'east', createDiceRoll('dice-1', 'east', [2, 3]), 14);
    expect(opening.nominalSelectedSide).toBe('east');
    expect(opening.countedStack).toEqual({ side: 'east', indexFromRight: 4 });
    expect(opening.liveStartStack).toEqual({ side: 'east', indexFromRight: 5 });
    expect(opening.liveTileOrder).toHaveLength(122);
    expect(opening.deadWallTileOrder).toHaveLength(14);
  });

  it('keeps the counting rule when extra tiles make side lengths uneven', () => {
    const tiles = Array.from({ length: 142 }, (_, index) => `tile-${index}`);
    const topology = buildWallTopology(tiles, 'south', {
      stackHeight: 2,
      distribution: 'balanced-from-dealer',
      partialStack: 'forbid',
    });
    expect(Object.values(topology.sides).reduce((sum, side) => sum + side.stacksFromRight.length, 0)).toBe(71);
    expect(Math.max(...Object.values(topology.sides).map((side) => side.stacksFromRight.length))
      - Math.min(...Object.values(topology.sides).map((side) => side.stacksFromRight.length))).toBeLessThanOrEqual(1);

    const opening = resolveWallOpening(topology, 'south', createDiceRoll('dice-2', 'south', [6, 6]), 14);
    expect(opening.liveTileOrder).toHaveLength(128);
    expect(opening.deadWallTileOrder).toHaveLength(14);
  });
});
