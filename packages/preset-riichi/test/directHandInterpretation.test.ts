import { describe, expect, it } from 'vitest';
import {
  compileWorld,
  enumeratePartitionInterpretations,
  instantiateRuleModule,
  type PartitionInterpretationItem,
  type PartitionInterpretationSource,
} from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import {
  RIICHI_DIRECT_INTERPRETATION_MODULE,
  RIICHI_HAND_STRUCTURE_PROFILES,
} from '../src/index.js';
import { buildTurnWorldFixture, type PhysicalTileSpec } from './support/turnWorldFixture.js';

const SEATS = ['east', 'south', 'west', 'north'];

function tiles(prefix: string, faces: string[]): PhysicalTileSpec[] {
  return faces.map((face, index) => ({ id: `${prefix}:${index}`, face }));
}

function profile() {
  const value = RIICHI_HAND_STRUCTURE_PROFILES.find((entry) =>
    entry.id === 'structure.standard-four-groups-pair');
  if (!value) throw new Error('Missing standard structure profile.');
  return value;
}

function item(spec: PhysicalTileSpec): PartitionInterpretationItem {
  return {
    id: spec.id,
    attributes: {
      id: spec.id,
      kind: 'tile',
      components: {
        tile: {
          baseFace: spec.face,
          suit: spec.face[0],
          rank: Number(spec.face[1]),
          effectiveFaces: [spec.face],
          traits: [],
        },
      },
    },
  };
}

function setup() {
  const eastHand = tiles('east:hand', [
    'm1', 'm2',
    'p1', 'p2', 'p3',
    's1', 's2', 's3',
    'z1', 'z1', 'z1',
    'm9', 'm9',
  ]);
  const wall = [
    { id: 'tile:draw:m3', face: 'm3' },
    { id: 'tile:draw:p9', face: 'p9' },
  ];
  const hands = Object.fromEntries(SEATS.map((seat) => [
    seat,
    seat === 'east' ? eastHand : tiles(`${seat}:hand`, Array.from({ length: 13 }, (_, index) =>
      `${['m', 'p', 's'][index % 3]}${(index % 9) + 1}`)),
  ]));
  const base = buildTurnWorldFixture({
    seats: SEATS,
    initialOwnerId: 'east',
    initialNodeId: 'await-draw',
    hands,
    wall,
  });
  base.source.actions.push({
    id: 'direct-win',
    parameters: { tileId: 'string' },
    requirements: [
      {
        id: 'direct-win.turn',
        kind: 'procedure-token',
        procedureId: 'turn',
        nodeId: 'await-discard',
        owner: 'actor',
        message: 'Direct win requires the post-draw state.',
      },
      {
        id: 'direct-win.tile-in-hand',
        kind: 'entity-in-zone',
        entity: { kind: 'context', path: 'params.tileId' },
        zone: { kind: 'template', template: 'hand:${actorId}' },
        message: 'The source tile is not in the subject hand.',
      },
      {
        id: 'direct-win.evidence',
        kind: 'relation-exists',
        source: { kind: 'actor' },
        target: {
          kind: 'entity',
          entityKind: 'tile',
          id: { kind: 'context', path: 'params.tileId' },
        },
        relationType: 'can-win-on',
        message: 'No accepted direct interpretation proves this source.',
      },
    ],
    effects: [{
      kind: 'event.emit',
      eventType: 'win.claimed',
      subjects: [{ kind: 'actor' }],
      objects: [{
        kind: 'entity',
        entityKind: 'tile',
        id: { kind: 'context', path: 'params.tileId' },
      }],
      payload: { mode: 'direct' },
    }],
  });
  const instantiated = instantiateRuleModule(base.source, {
    definition: RIICHI_DIRECT_INTERPRETATION_MODULE,
    bindings: {
      playerIds: SEATS,
      subjectZones: SEATS.map((subjectId) => ({ subjectId, zoneId: `hand:${subjectId}` })),
      sourceZoneIds: ['wall.live', 'wall.dead'],
      drawActionId: 'draw',
      evidenceRelationType: 'can-win-on',
    },
  });
  const value = new WorldRuntime(compileWorld(instantiated.world));
  value.start();
  return { value, eastHand, wall, artifacts: instantiated.artifacts };
}

function attempt(
  value: WorldRuntime,
  attemptId: string,
  actionId: string,
  parameters: Record<string, unknown> = {},
) {
  return value.attempt({
    attemptId,
    actorId: 'east',
    actionId,
    observedRevision: value.currentRevision,
    parameters,
  });
}

function sourceEntity(value: WorldRuntime) {
  return value.store.readComponent<{
    state: string;
    sourceActorId: string;
    sourceEventId: string | null;
    sourceEntityId: string | null;
  }>('service.riichi-direct-hand-interpretation:source:east', 'responseWindow');
}

function records(value: WorldRuntime) {
  return value.store.readComponent<{ records: Array<Record<string, unknown>> }>(
    'track:direct-hand-interpretations',
    'interpretations',
  )?.records ?? [];
}

describe('tracked direct-source partition interpretation', () => {
  it('tracks the latest physical draw without opening a response window', () => {
    const { value, wall } = setup();
    expect(sourceEntity(value)?.state).toBe('unavailable');
    expect(attempt(value, 'draw', 'draw').outcome).toBe('executed');
    expect(sourceEntity(value)).toMatchObject({
      state: 'available',
      sourceActorId: 'east',
      sourceEntityId: wall[0].id,
    });
    expect(value.openResponseWindows()).toEqual([]);
  });

  it('creates direct evidence only after authoritative proposal acceptance', () => {
    const { value, eastHand, wall, artifacts } = setup();
    expect(attempt(value, 'draw', 'draw').outcome).toBe('executed');
    const tracked = sourceEntity(value);
    if (!tracked?.sourceEventId || !tracked.sourceEntityId) throw new Error('Tracked source missing.');
    const source = {
      mode: 'direct',
      windowId: 'service.riichi-direct-hand-interpretation:source:east',
      exposureId: tracked.sourceEventId,
      sourceEntityId: tracked.sourceEntityId,
      sourceActorId: 'east',
    } as unknown as PartitionInterpretationSource;
    const proposals = enumeratePartitionInterpretations(
      profile(),
      [...eastHand, wall[0]].map(item),
      source,
    );
    expect(proposals.length).toBeGreaterThan(0);

    expect(attempt(value, 'win-before-proof', 'direct-win', { tileId: wall[0].id }).outcome)
      .toBe('rejected');
    expect(attempt(value, 'accept-direct', 'interpretation.submit-direct', {
      windowId: source.windowId,
      proposal: proposals[0].proposal,
    }).outcome).toBe('executed');
    expect(records(value)).toHaveLength(1);
    expect(records(value)[0]).toMatchObject({
      actorId: 'east',
      source: { mode: 'direct', sourceEntityId: wall[0].id },
    });
    expect(value.store.outgoingRelations({ kind: 'player', id: 'east' }, 'can-win-on')
      .map((entry) => entry.target.id)).toContain(wall[0].id);
    expect(attempt(value, 'win-after-proof', 'direct-win', { tileId: wall[0].id }).outcome)
      .toBe('executed');

    expect((artifacts.sourceWindowIds as string[])).toContain(source.windowId);
  });

  it('rejects a proposal after the tracked source leaves the subject zone', () => {
    const { value, eastHand, wall } = setup();
    expect(attempt(value, 'draw', 'draw').outcome).toBe('executed');
    const tracked = sourceEntity(value);
    if (!tracked?.sourceEventId || !tracked.sourceEntityId) throw new Error('Tracked source missing.');
    const source = {
      mode: 'direct',
      windowId: 'service.riichi-direct-hand-interpretation:source:east',
      exposureId: tracked.sourceEventId,
      sourceEntityId: tracked.sourceEntityId,
      sourceActorId: 'east',
    } as unknown as PartitionInterpretationSource;
    const proposals = enumeratePartitionInterpretations(
      profile(),
      [...eastHand, wall[0]].map(item),
      source,
    );
    expect(proposals.length).toBeGreaterThan(0);

    expect(attempt(value, 'discard-source', 'discard', {
      tileId: wall[0].id,
      nextActorId: 'south',
    }).outcome).toBe('executed');
    const receipt = attempt(value, 'late-direct-proof', 'interpretation.submit-direct', {
      windowId: source.windowId,
      proposal: proposals[0].proposal,
    });
    expect(receipt.outcome).toBe('rejected');
    expect(receipt.failures.map((entry) => entry.id))
      .toContain('interpretation.submit-direct.source-in-zone');
    expect(records(value)).toEqual([]);
  });
});
