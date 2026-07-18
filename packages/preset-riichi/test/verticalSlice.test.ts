import { describe, expect, it } from 'vitest';
import { compileWorld } from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import { createRiichiWorldSource } from '../src/preset.js';

function runtime(seed = 'test-seed', extra = {}) {
  const image = compileWorld(createRiichiWorldSource({ seed, ...extra }));
  const value = new WorldRuntime(image);
  value.start();
  return value;
}

function passOpenWindow(value: WorldRuntime): void {
  const window = value.openResponseWindows()[0];
  for (const actorId of window.participants) {
    value.attempt({
      attemptId: `pass:${window.id}:${actorId}`,
      actorId,
      actionId: 'response.pass',
      observedRevision: value.currentRevision,
      parameters: { windowId: window.id },
    });
  }
}

describe('riichi world vertical slice', () => {
  it('builds, opens and deals a standard physical wall through MWIR', () => {
    const value = runtime();
    expect(value.store.entitiesOfKind('tile')).toHaveLength(136);
    expect(value.store.entitiesOfKind('wall-stack')).toHaveLength(68);
    expect(value.store.zoneEntityIds('wall.dead')).toHaveLength(14);
    expect(value.store.zoneEntityIds('wall.live')).toHaveLength(70);
    for (const seat of ['east', 'south', 'west', 'north']) {
      expect(value.store.zoneEntityIds(`hand:${seat}`)).toHaveLength(13);
      expect(value.store.zoneEntityIds(`river:${seat}`)).toHaveLength(0);
    }
    expect(value.scheduler.find('turn', 'await-draw', 'east')).toBeDefined();
  });

  it('uses the same world image and physical order for the same seed', () => {
    const left = compileWorld(createRiichiWorldSource({ seed: 'same' }));
    const right = compileWorld(createRiichiWorldSource({ seed: 'same' }));
    expect(left.hash).toBe(right.hash);
    expect(left.zones.find((zone) => zone.id === 'wall.live')?.entries.map((entry) => entry.entityId))
      .toEqual(right.zones.find((zone) => zone.id === 'wall.live')?.entries.map((entry) => entry.entityId));
  });

  it('executes draw, discard, response pass, river placement and turn rotation through definitions', () => {
    const value = runtime();
    const drawnTile = value.store.zoneEntityIds('wall.live')[0];
    const draw = value.attempt({
      attemptId: 'attempt:draw', actorId: 'east', actionId: 'draw', observedRevision: value.currentRevision, parameters: {},
    });
    expect(draw.outcome).toBe('executed');
    expect(value.store.zoneEntityIds('hand:east')).toContain(drawnTile);
    expect(value.store.zoneEntityIds('hand:east')).toHaveLength(14);
    expect(value.scheduler.find('turn', 'await-discard', 'east')).toBeDefined();

    const discard = value.attempt({
      attemptId: 'attempt:discard', actorId: 'east', actionId: 'discard', observedRevision: value.currentRevision,
      parameters: { tileId: drawnTile },
    });
    expect(discard.outcome).toBe('executed');
    expect(value.store.zoneEntityIds('river:east')).toEqual([drawnTile]);
    expect(value.store.readZone('river:east').entries[0].metadata.orientation).toBe('upright');
    expect(value.scheduler.find('turn', 'await-response', 'east')).toBeDefined();
    expect(value.openResponseWindows()).toHaveLength(1);

    passOpenWindow(value);
    expect(value.scheduler.find('turn', 'await-draw', 'south')).toBeDefined();
    expect(value.journal.all().some((event) => event.type === 'tile.drawn' && event.objects[0]?.id === drawnTile)).toBe(true);
    expect(value.journal.all().some((event) => event.type === 'tile.discarded' && event.objects[0]?.id === drawnTile)).toBe(true);
    expect(value.journal.all().some((event) => event.type === 'response-window.resolved')).toBe(true);
  });

  it('records out-of-flow actions as rejected attempts rather than hiding the action language', () => {
    const value = runtime();
    const receipt = value.attempt({
      attemptId: 'attempt:bad-discard', actorId: 'south', actionId: 'discard', observedRevision: value.currentRevision,
      parameters: { tileId: value.store.zoneEntityIds('hand:south')[0] },
    });
    expect(receipt.outcome).toBe('rejected');
    expect(receipt.failures.map((failure) => failure.id)).toContain('discard.correct-turn');
    expect(value.journal.all().some((event) => event.type === 'action.attempted')).toBe(true);
    expect(value.journal.all().some((event) => event.type === 'action.rejected')).toBe(true);
  });

  it('supports altered tile counts, arbitrary red honors and negative tile contributions without a privileged engine path', () => {
    const value = runtime('extended', {
      extraCopies: { m1: 2 },
      variants: [{
        id: 'red-east',
        face: 'z1',
        count: 1,
        appearance: { color: 'red' },
        traits: ['red', 'honor'],
        scoreContributions: [{ phase: 'han', amount: -1, eventType: 'win.evaluated', contextTags: ['ron'], label: '赤东负一番' }],
      }],
    });
    expect(value.store.entitiesOfKind('tile')).toHaveLength(138);
    expect(value.store.entitiesOfKind('wall-stack')).toHaveLength(69);
    const opening = value.journal.all().find((event) => event.type === 'wall.opened');
    expect(opening?.payload.sideStackCounts).toEqual({ east: 18, south: 17, west: 17, north: 17 });
    expect(value.store.zoneEntityIds('wall.dead')).toHaveLength(14);
    expect(value.store.zoneEntityIds('wall.live')).toHaveLength(72);
    const redEast = value.store.entitiesOfKind('tile').find((entity) => entity.id.includes('red-east'));
    expect((redEast?.components.tile as any).appearance.color).toBe('red');
    expect((redEast?.components.tile as any).scoreContributions[0].amount).toBe(-1);
  });
});
