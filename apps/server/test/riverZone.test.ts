import { describe, expect, it } from 'vitest';
import { RiverZone } from '../src/kernel/riverZone.js';

describe('river zone', () => {
  it('keeps a positional tombstone when a discard is claimed', () => {
    const river = new RiverZone('river-east', 'player-east');
    const first = river.place('tile-1', 'discard-event-1');
    river.place('tile-2', 'discard-event-2', 'sideways');
    const claimed = river.claim(first.id, 'pon-action-1');
    expect(claimed.state).toBe('claimed');
    expect(claimed.claimedByAction?.id).toBe('pon-action-1');
    expect(river.snapshot()[1]).toMatchObject({ row: 0, column: 1, orientation: 'sideways' });
  });
});
