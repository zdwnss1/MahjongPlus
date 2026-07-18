import { describe, expect, it } from 'vitest';
import { compileWorld } from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import { createRiichiWorldSource } from '../src/preset.js';

function runtime(seed: string): WorldRuntime {
  const value = new WorldRuntime(compileWorld(createRiichiWorldSource({ seed })));
  value.start();
  return value;
}

function moveToHand(value: WorldRuntime, tileId: string, seat: string): void {
  const current = value.store.zoneContaining(tileId);
  if (!current) throw new Error(`Tile ${tileId} has no active zone.`);
  if (current.id !== `hand:${seat}`) value.store.move(tileId, current.id, `hand:${seat}`);
}

function faceTiles(value: WorldRuntime, face: string): string[] {
  return value.store.entitiesOfKind('tile')
    .filter((entity) => value.store.readEntityPath(entity.id, 'tile.baseFace') === face)
    .map((entity) => entity.id);
}

function drawAndDiscard(value: WorldRuntime, tileId: string): string {
  const draw = value.attempt({
    attemptId: `draw:${tileId}`,
    actorId: 'east',
    actionId: 'draw',
    observedRevision: value.currentRevision,
    parameters: {},
  });
  expect(draw.outcome).toBe('executed');
  moveToHand(value, tileId, 'east');
  const discard = value.attempt({
    attemptId: `discard:${tileId}`,
    actorId: 'east',
    actionId: 'discard',
    observedRevision: value.currentRevision,
    parameters: { tileId },
  });
  expect(discard.outcome).toBe('executed');
  return value.openResponseWindows()[0].id;
}

function submit(
  value: WorldRuntime,
  actorId: string,
  actionId: string,
  windowId: string,
  parameters: Record<string, unknown> = {},
) {
  return value.attempt({
    attemptId: `${windowId}:${actorId}:${actionId}`,
    actorId,
    actionId,
    observedRevision: value.currentRevision,
    parameters: { windowId, ...parameters },
  });
}

describe('discard response windows', () => {
  it('selects pon above chi, creates a meld and leaves a claimed river tombstone', () => {
    const value = runtime('pon-above-chi');
    const [source, westOne, westTwo] = faceTiles(value, 'm5');
    const [southFour] = faceTiles(value, 'm4');
    const [southSix] = faceTiles(value, 'm6');
    moveToHand(value, westOne, 'west');
    moveToHand(value, westTwo, 'west');
    moveToHand(value, southFour, 'south');
    moveToHand(value, southSix, 'south');
    const windowId = drawAndDiscard(value, source);

    expect(submit(value, 'south', 'chi', windowId, { tileIds: [southFour, southSix] }).outcome).toBe('executed');
    expect(submit(value, 'west', 'pon', windowId, { tileIds: [westOne, westTwo] }).outcome).toBe('executed');
    expect(submit(value, 'north', 'response.pass', windowId).outcome).toBe('executed');

    const window = value.windows.read(windowId);
    expect(window.selected.map((entry) => entry.actionId)).toEqual(['pon']);
    expect(window.selected[0].actorId).toBe('west');
    expect(value.scheduler.find('turn', 'await-discard', 'west')).toBeDefined();

    const riverEntry = value.store.readZone('river:east').entries.find((entry) => entry.entityId === source);
    expect(riverEntry?.state).toBe('claimed');
    expect(riverEntry?.claimedByActionId).toBe(window.selected[0].actionEntityId);
    expect(value.store.zoneEntityIds('river:east')).not.toContain(source);
    expect(value.store.zoneEntityIds('meld-tiles:west')).toEqual(expect.arrayContaining([source, westOne, westTwo]));

    const meldId = value.store.zoneEntityIds('melds:west')[0];
    const meld = value.store.readEntity(meldId);
    expect((meld.components.meld as any).callType).toBe('pon');
    expect(value.store.outgoingRelations({ kind: 'meld', id: meldId }, 'contains')).toHaveLength(3);
    expect(value.store.zoneEntityIds('melds:south')).toHaveLength(0);
  });

  it('keeps all highest-priority ron claims in deterministic turn order', () => {
    const value = runtime('multiple-ron');
    const source = value.store.entitiesOfKind('tile')[0].id;
    const windowId = drawAndDiscard(value, source);
    value.store.connect({
      id: 'relation:test:south-can-ron',
      type: 'can-win-on',
      source: { kind: 'player', id: 'south' },
      target: { kind: 'tile', id: source },
      metadata: {},
    });
    value.store.connect({
      id: 'relation:test:north-can-ron',
      type: 'can-win-on',
      source: { kind: 'player', id: 'north' },
      target: { kind: 'tile', id: source },
      metadata: {},
    });

    expect(submit(value, 'south', 'ron', windowId).outcome).toBe('executed');
    expect(submit(value, 'west', 'response.pass', windowId).outcome).toBe('executed');
    expect(submit(value, 'north', 'ron', windowId).outcome).toBe('executed');

    expect(value.windows.read(windowId).selected.map((entry) => entry.actorId)).toEqual(['south', 'north']);
    expect(value.journal.all().filter((event) => event.type === 'win.claimed').map((event) => event.actorId))
      .toEqual(['south', 'north']);
    expect(value.scheduler.find('turn', 'await-win-resolution', 'east')).toBeDefined();
  });

  it('rejects chi from a non-next player without consuming that player response', () => {
    const value = runtime('invalid-chi-seat');
    const source = value.store.entitiesOfKind('tile')[0].id;
    const windowId = drawAndDiscard(value, source);
    const tileIds = value.store.zoneEntityIds('hand:west').slice(0, 2);
    const receipt = submit(value, 'west', 'chi', windowId, { tileIds });
    expect(receipt.outcome).toBe('rejected');
    expect(receipt.failures.map((failure) => failure.id)).toContain('chi.next-player');
    expect(value.windows.read(windowId).submissions.west).toBeUndefined();
  });

  it('rolls back the closing submission and window resolution when selected effects fail', () => {
    const value = runtime('response-rollback');
    const [source, westOne, westTwo] = faceTiles(value, 'p7');
    moveToHand(value, westOne, 'west');
    moveToHand(value, westTwo, 'west');
    const windowId = drawAndDiscard(value, source);

    expect(submit(value, 'south', 'response.pass', windowId).outcome).toBe('executed');
    expect(submit(value, 'west', 'pon', windowId, { tileIds: [westOne, westTwo] }).outcome).toBe('executed');
    value.store.move(westTwo, 'hand:west', 'hand:north');

    const closing = submit(value, 'north', 'response.pass', windowId);
    expect(closing.outcome).toBe('invalid');
    const window = value.windows.read(windowId);
    expect(window.state).toBe('open');
    expect(window.submissions.north).toBeUndefined();
    expect(window.submissions.west?.actionId).toBe('pon');
    expect(value.store.zoneEntityIds('melds:west')).toHaveLength(0);
    expect(value.store.readZone('river:east').entries.find((entry) => entry.entityId === source)?.state).toBe('occupied');
  });
});
