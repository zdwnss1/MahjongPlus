import { describe, expect, it } from 'vitest';
import {
  compileWorld,
  enumeratePartitionInterpretations,
  instantiateRuleModule,
  validateDataAgainstSchema,
  type PartitionInterpretationItem,
  type PartitionInterpretationProfile,
  type WorldSource,
} from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import {
  RIICHI_HAND_STRUCTURE_PROFILES,
  RIICHI_RESPONSE_INTERPRETATION_MODULE,
} from '../src/handStructureProfiles.js';

interface TileEntity {
  id: string;
  kind: 'tile';
  components: {
    tile: {
      baseFace: string;
      suit: string;
      rank: number;
      effectiveFaces: string[];
      traits: string[];
    };
  };
}

function tile(id: string, face: string): TileEntity {
  return {
    id,
    kind: 'tile',
    components: {
      tile: {
        baseFace: face,
        suit: face[0],
        rank: Number(face[1]),
        effectiveFaces: [face],
        traits: [],
      },
    },
  };
}

function zone(id: string, kind: string, entityIds: string[]) {
  return {
    id,
    kind,
    ordered: true,
    entries: entityIds.map((entityId, ordinal) => ({
      slotId: `${id}:slot:${ordinal}`,
      entityId,
      ordinal,
      metadata: {},
      state: 'occupied' as const,
    })),
    metadata: {},
  };
}

function numbered(prefix: string, faces: string[]): TileEntity[] {
  return faces.map((face, index) => tile(`${prefix}:${index}`, face));
}

function responseWorld(handTiles: TileEntity[], sourceTile: TileEntity): WorldSource {
  const players = ['east', 'south', 'west', 'north'].map((id) => ({
    id,
    kind: 'player',
    components: { seat: { seat: id } },
  }));
  return {
    schemaVersion: 'mwl/0.7',
    id: 'fixture:response-interpretation',
    entities: [...players, ...handTiles, sourceTile],
    zones: [
      zone('hand:east', 'hand', []),
      zone('hand:south', 'hand', handTiles.map((entry) => entry.id)),
      zone('hand:west', 'hand', []),
      zone('hand:north', 'hand', []),
      zone('river:east', 'river', [sourceTile.id]),
    ],
    relations: [],
    actions: [
      {
        id: 'open-opportunity',
        parameters: {},
        requirements: [],
        effects: [
          {
            kind: 'event.emit',
            eventType: 'tile.discarded',
            subjects: [{ kind: 'entity', entityKind: 'player', id: { kind: 'literal', value: 'east' } }],
            objects: [{ kind: 'entity', entityKind: 'tile', id: { kind: 'literal', value: sourceTile.id } }],
            payload: { tileId: sourceTile.id },
          },
          {
            kind: 'response-window.open',
            definitionId: 'riichi.discard-response',
            windowId: { kind: 'literal', value: 'window:test' },
            sourceActor: { kind: 'literal', value: 'east' },
            sourceEvent: { kind: 'context', path: 'lastEventId' },
            sourceEntity: { kind: 'literal', value: sourceTile.id },
            parentTokenId: { kind: 'literal', value: 'token:none' },
          },
        ],
      },
      {
        id: 'ron',
        parameters: { windowId: 'string' },
        requirements: [
          {
            id: 'ron.window',
            kind: 'response-window-open',
            windowId: { kind: 'context', path: 'params.windowId' },
            message: 'The response window is unavailable.',
          },
          {
            id: 'ron.evidence',
            kind: 'relation-exists',
            source: { kind: 'actor' },
            target: { kind: 'window-source-entity', entityKind: 'tile' },
            relationType: 'can-win-on',
            message: 'No accepted interpretation proves this win.',
          },
        ],
        effects: [{ kind: 'response-window.submit', windowId: { kind: 'context', path: 'params.windowId' } }],
      },
      {
        id: 'response.pass',
        parameters: { windowId: 'string' },
        requirements: [{
          id: 'pass.window',
          kind: 'response-window-open',
          windowId: { kind: 'context', path: 'params.windowId' },
          message: 'The response window is unavailable.',
        }],
        effects: [{ kind: 'response-window.submit', windowId: { kind: 'context', path: 'params.windowId' } }],
      },
    ],
    procedures: [],
    responseWindows: [{
      id: 'riichi.discard-response',
      allowedActionIds: ['ron', 'response.pass'],
      participantOrder: ['east', 'south', 'west', 'north'],
      excludeSourceActor: true,
      tiers: [{ actionIds: ['ron'], selection: 'all', maxSelections: 3 }],
      noSelectionEffects: [],
      selectionEffects: { ron: [] },
    }],
    corePrograms: { constraints: [], reducers: [], rewrites: [] },
    bootstrap: [],
  };
}

function items(entities: TileEntity[]): PartitionInterpretationItem[] {
  return entities.map((entity) => ({
    id: entity.id,
    attributes: structuredClone(entity) as unknown as Record<string, unknown>,
  }));
}

function profile(id: string): PartitionInterpretationProfile {
  const value = RIICHI_HAND_STRUCTURE_PROFILES.find((entry) => entry.id === id);
  if (!value) throw new Error(`Missing profile ${id}`);
  return value;
}

function runtimeFor(handTiles: TileEntity[], sourceTile: TileEntity) {
  const instantiated = instantiateRuleModule(responseWorld(handTiles, sourceTile), {
    definition: RIICHI_RESPONSE_INTERPRETATION_MODULE,
    bindings: {
      subjectZones: [
        { subjectId: 'east', zoneId: 'hand:east' },
        { subjectId: 'south', zoneId: 'hand:south' },
        { subjectId: 'west', zoneId: 'hand:west' },
        { subjectId: 'north', zoneId: 'hand:north' },
      ],
      evidenceRelationType: 'can-win-on',
    },
  });
  const value = new WorldRuntime(compileWorld(instantiated.world));
  return { value, world: instantiated.world, artifacts: instantiated.artifacts };
}

function attempt(
  value: WorldRuntime,
  attemptId: string,
  actorId: string,
  actionId: string,
  parameters: Record<string, unknown> = {},
) {
  return value.attempt({
    attemptId,
    actorId,
    actionId,
    observedRevision: value.currentRevision,
    parameters,
  });
}

function open(value: WorldRuntime) {
  expect(attempt(value, 'open', 'east', 'open-opportunity').outcome).toBe('executed');
  return value.openResponseWindows()[0];
}

function source(sourceTile: TileEntity) {
  return {
    mode: 'response' as const,
    windowId: 'window:test',
    exposureId: 'event:1',
    sourceEntityId: sourceTile.id,
    sourceActorId: 'east',
  };
}

function accepted(value: WorldRuntime) {
  return value.store.readComponent<{ records: Array<Record<string, unknown>> }>(
    'track:hand-interpretations',
    'interpretations',
  )?.records ?? [];
}

describe('authoritative finite partition hand interpretation', () => {
  it('enumerates and authoritatively accepts a four-groups-and-pair response interpretation', () => {
    const hand = numbered('south:hand', [
      'm1', 'm2',
      'p1', 'p2', 'p3',
      's1', 's2', 's3',
      'z1', 'z1', 'z1',
      'm9', 'm9',
    ]);
    const winning = tile('tile:winning:m3', 'm3');
    const { value, artifacts } = runtimeFor(hand, winning);
    const window = open(value);
    const proposals = enumeratePartitionInterpretations(
      profile('structure.standard-four-groups-pair'),
      items([...hand, winning]),
      { ...source(winning), exposureId: window.sourceEventId },
    );
    expect(proposals.length).toBeGreaterThan(0);
    const actionSchema = (artifacts.inputSchema ?? {}) as Parameters<typeof validateDataAgainstSchema>[0];
    expect(validateDataAgainstSchema(actionSchema, {
      windowId: window.id,
      proposal: proposals[0].proposal,
    })).toEqual([]);

    expect(attempt(value, 'south-ron-before-proof', 'south', 'ron', { windowId: window.id }).outcome)
      .toBe('rejected');
    expect(attempt(value, 'accept-interpretation', 'south', 'interpretation.submit-response', {
      windowId: window.id,
      proposal: proposals[0].proposal,
    }).outcome).toBe('executed');

    expect(accepted(value)).toHaveLength(1);
    const evidence = value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'can-win-on');
    expect(evidence.map((entry) => entry.target.id)).toContain(winning.id);
    expect(attempt(value, 'south-ron', 'south', 'ron', { windowId: window.id }).outcome).toBe('executed');
  });

  it('rejects a malformed grouping and leaves no partial evidence', () => {
    const hand = numbered('south:hand', [
      'm1', 'm2',
      'p1', 'p2', 'p3',
      's1', 's2', 's3',
      'z1', 'z1', 'z1',
      'm9', 'm9',
    ]);
    const winning = tile('tile:winning:m3', 'm3');
    const { value } = runtimeFor(hand, winning);
    const window = open(value);
    const proposal = enumeratePartitionInterpretations(
      profile('structure.standard-four-groups-pair'),
      items([...hand, winning]),
      { ...source(winning), exposureId: window.sourceEventId },
    )[0].proposal;
    const malformed = structuredClone(proposal);
    malformed.groups[0].itemIds[0] = 'tile:not-in-hand';

    const receipt = attempt(value, 'bad-interpretation', 'south', 'interpretation.submit-response', {
      windowId: window.id,
      proposal: malformed,
    });
    expect(receipt.outcome).toBe('rejected');
    expect(receipt.failures.map((entry) => entry.id)).toContain('service.riichi-response-hand-interpretation.submit-response.valid');
    expect(accepted(value)).toEqual([]);
    expect(value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'can-win-on')).toEqual([]);
  });

  it('enumerates seven-pairs and thirteen-orphans structures from the same generic grammar', () => {
    const sevenPairTiles = numbered('seven', [
      'm1', 'm1', 'm2', 'm2', 'p1', 'p1', 'p2', 'p2',
      's1', 's1', 'z1', 'z1', 'z2', 'z2',
    ]);
    const seven = enumeratePartitionInterpretations(
      profile('structure.seven-pairs'),
      items(sevenPairTiles),
      {
        mode: 'response', windowId: 'w:seven', exposureId: 'e:seven',
        sourceEntityId: sevenPairTiles.at(-1)?.id as string, sourceActorId: 'east',
      },
    );
    expect(seven.some((entry) => entry.proposal.structureId === 'seven-pairs')).toBe(true);

    const orphanFaces = ['m1', 'm9', 'p1', 'p9', 's1', 's9', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'];
    const orphanTiles = numbered('orphans', [...orphanFaces, 'z1']);
    const orphans = enumeratePartitionInterpretations(
      profile('structure.thirteen-orphans'),
      items(orphanTiles),
      {
        mode: 'response', windowId: 'w:orphans', exposureId: 'e:orphans',
        sourceEntityId: orphanTiles.at(-1)?.id as string, sourceActorId: 'east',
      },
    );
    expect(orphans.some((entry) => entry.proposal.structureId === 'thirteen-orphans')).toBe(true);
  });

  it('rejects the exact same accepted proposal twice', () => {
    const hand = numbered('south:hand', [
      'm1', 'm2',
      'p1', 'p2', 'p3',
      's1', 's2', 's3',
      'z1', 'z1', 'z1',
      'm9', 'm9',
    ]);
    const winning = tile('tile:winning:m3', 'm3');
    const { value } = runtimeFor(hand, winning);
    const window = open(value);
    const proposal = enumeratePartitionInterpretations(
      profile('structure.standard-four-groups-pair'),
      items([...hand, winning]),
      { ...source(winning), exposureId: window.sourceEventId },
    )[0].proposal;
    expect(attempt(value, 'first-proof', 'south', 'interpretation.submit-response', {
      windowId: window.id, proposal,
    }).outcome).toBe('executed');
    expect(attempt(value, 'second-proof', 'south', 'interpretation.submit-response', {
      windowId: window.id, proposal,
    }).outcome).toBe('rejected');
    expect(accepted(value)).toHaveLength(1);
  });
});
