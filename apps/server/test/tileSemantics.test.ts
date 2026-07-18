import { describe, expect, it } from 'vitest';
import { coloredPrototype, createTileInstance, totalContributions, type TileScoreContribution } from '../src/kernel/tileSemantics.js';

describe('independent tile semantics', () => {
  it('allows any base face to be red without making red itself a scoring rule', () => {
    const redEast = coloredPrototype('red-east', 'z1', 'red', ['honor']);
    const tile = createTileInstance('tile-red-east-1', redEast);
    expect(tile.physicalFace).toBe('z1');
    expect(tile.traits).toContain('red');
    expect(redEast.engineFace).toBe('z1');
  });

  it('supports contextual negative han contributions', () => {
    const contributions: TileScoreContribution[] = [{
      id: 'minus-one',
      source: { kind: 'tile', id: 'tile-cursed' },
      phase: 'han',
      amount: -1,
      label: '诅咒牌',
      eventType: 'win.evaluated',
      contextTags: ['ron'],
    }];
    expect(totalContributions(contributions, 'han', 'win.evaluated', ['ron'])).toBe(-1);
    expect(totalContributions(contributions, 'han', 'win.evaluated', ['tsumo'])).toBe(0);
  });
});
