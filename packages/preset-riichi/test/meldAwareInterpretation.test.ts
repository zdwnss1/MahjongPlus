import { describe, expect, it } from 'vitest';
import {
  compileWorld,
  enumeratePartitionInterpretations,
  instantiateRuleModule,
  type PartitionInterpretationItem,
  type PartitionInterpretationProfile,
  type WorldSource,
} from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import {
  RIICHI_FIXED_MELD_CONTEXT_MODULE,
  RIICHI_HAND_STRUCTURE_PROFILES,
  RIICHI_RESPONSE_INTERPRETATION_MODULE,
  RIICHI_WAIT_CLASSIFICATION_MODULE,
} from '../src/index.js';

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

const SEATS = ['east', 'south', 'west', 'north'];

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

function numbered(prefix: string, faces: string[]): TileEntity[] {
  return faces.map((face, index) => tile(`${prefix}:${index}`, face));
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

function items(entities: TileEntity[]): PartitionInterpretationItem[] {
  return entities.map((entity) => ({
    id: entity.id,
    attributes: structuredClone(entity) as unknown as Record<string, unknown>,
  }));
}

function profile(id: string): PartitionInterpretationProfile {
  const value = RIICHI_HAND_STRUCTURE_PROFILES.find((entry) => entry.id === id);
  if (!value) throw new Error(`Missing profile ${id}.`);
  return value;
}

interface MeldSpec {
  id: string;
  callType: 'pon' | 'chi' | 'open-kan';
  tiles: TileEntity[];
}

function responseWorld(handTiles: TileEntity[], sourceTile: TileEntity, melds: MeldSpec[] = []): WorldSource {
  const players = SEATS.map((id) => ({
    id,
    kind: 'player',
    components: { seat: { seat: id } },
  }));
  const meldEntities = melds.map((meld) => ({
    id: meld.id,
    kind: 'meld',
    components: {
      meld: {
        callType: meld.callType,
        ownerId: 'south',
        sourceEventId: `event:${meld.id}`,
        calledTileId: meld.tiles[0]?.id,
        tileIds: meld.tiles.map((entry) => entry.id),
      },
    },
  }));
  const relations = melds.flatMap((meld) => meld.tiles.map((entry, index) => ({
    id: `relation:${meld.id}:${index}`,
    type: 'contains',
    source: { kind: 'meld', id: meld.id },
    target: { kind: 'tile', id: entry.id },
    metadata: {},
  })));
  return {
    schemaVersion: 'mwl/0.8',
    id: 'fixture:meld-aware-response-interpretation',
    entities: [
      ...players,
      ...handTiles,
      sourceTile,
      ...meldEntities,
      ...melds.flatMap((entry) => entry.tiles),
    ],
    zones: [
      zone('hand:east', 'hand', []),
      zone('hand:south', 'hand', handTiles.map((entry) => entry.id)),
      zone('hand:west', 'hand', []),
      zone('hand:north', 'hand', []),
      zone('river:east', 'river', [sourceTile.id]),
      zone('melds:south', 'melds', melds.map((entry) => entry.id)),
      zone('meld-tiles:south', 'meld-tiles', melds.flatMap((entry) => entry.tiles.map((tileEntity) => tileEntity.id))),
    ],
    relations,
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
      participantOrder: [...SEATS],
      excludeSourceActor: true,
      tiers: [{ actionIds: ['ron'], selection: 'all', maxSelections: 3 }],
      noSelectionEffects: [],
      selectionEffects: { ron: [] },
    }],
    corePrograms: { constraints: [], reducers: [], rewrites: [] },
    bootstrap: [],
  };
}

function runtimeFor(handTiles: TileEntity[], sourceTile: TileEntity, melds: MeldSpec[] = []) {
  let world = responseWorld(handTiles, sourceTile, melds);
  for (const definition of [
    RIICHI_RESPONSE_INTERPRETATION_MODULE,
    RIICHI_FIXED_MELD_CONTEXT_MODULE,
    RIICHI_WAIT_CLASSIFICATION_MODULE,
  ]) {
    world = instantiateRuleModule(world, {
      definition,
      bindings: definition.id === RIICHI_RESPONSE_INTERPRETATION_MODULE.id
        ? {
            subjectZones: SEATS.map((subjectId) => ({ subjectId, zoneId: `hand:${subjectId}` })),
            evidenceRelationType: 'can-win-on',
          }
        : {},
    }).world;
  }
  const value = new WorldRuntime(compileWorld(world));
  return { value, world };
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

function accepted(value: WorldRuntime, trackId: string, component: string) {
  return value.store.readComponent<{ records: Array<Record<string, unknown>> }>(trackId, component)?.records ?? [];
}

function acceptFirst(
  hand: TileEntity[],
  sourceTile: TileEntity,
  profileId: string,
  melds: MeldSpec[] = [],
) {
  const { value } = runtimeFor(hand, sourceTile, melds);
  const window = open(value);
  const proposals = enumeratePartitionInterpretations(
    profile(profileId),
    items([...hand, sourceTile]),
    {
      mode: 'response',
      windowId: window.id,
      exposureId: window.sourceEventId,
      sourceEntityId: sourceTile.id,
      sourceActorId: 'east',
    },
  );
  expect(proposals.length).toBeGreaterThan(0);
  const receipt = attempt(value, 'accept', 'south', 'interpretation.submit-response', {
    windowId: window.id,
    proposal: proposals[0].proposal,
  });
  return { value, window, proposal: proposals[0].proposal, receipt };
}

describe('meld-aware interpretation context', () => {
  it('combines one existing pon with three concealed groups and a pair without repartitioning the meld', () => {
    const hand = numbered('south:hand', [
      'm2', 'm3',
      'p1', 'p2', 'p3',
      's1', 's2', 's3',
      'm9', 'm9',
    ]);
    const winning = tile('tile:winning:m4', 'm4');
    const meld: MeldSpec = {
      id: 'meld:south:pon:z1',
      callType: 'pon',
      tiles: numbered('meld:z1', ['z1', 'z1', 'z1']),
    };
    const result = acceptFirst(
      hand,
      winning,
      'structure.standard-four-groups-pair.fixed-1',
      [meld],
    );
    expect(result.receipt.outcome).toBe('executed');
    const contexts = accepted(
      result.value,
      'track:fixed-meld-interpretation-contexts',
      'fixedGroupContexts',
    );
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      actorId: 'south',
      closed: false,
      fixedGroups: [{
        groupEntityId: meld.id,
        groupType: 'pon',
        patternId: 'group.triplet.same-face',
        itemIds: meld.tiles.map((entry) => entry.id),
      }],
    });
    expect(result.value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'has-hand-shape')
      .map((entry) => entry.target.id)).toContain(winning.id);
    const waits = accepted(result.value, 'track:wait-classifications', 'waitClassifications');
    expect(waits).toHaveLength(1);
    expect(waits[0]).toMatchObject({
      actorId: 'south',
      sourceEntityId: winning.id,
      classification: 'two-sided',
    });
    expect(attempt(result.value, 'ron', 'south', 'ron', { windowId: result.window.id }).outcome)
      .toBe('executed');
  });

  it('rejects the interpretation atomically when an existing group has invalid physical membership', () => {
    const hand = numbered('south:hand', [
      'm2', 'm3',
      'p1', 'p2', 'p3',
      's1', 's2', 's3',
      'm9', 'm9',
    ]);
    const winning = tile('tile:winning:m4', 'm4');
    const invalidMeld: MeldSpec = {
      id: 'meld:south:bad-pon',
      callType: 'pon',
      tiles: numbered('meld:bad', ['z1', 'z1', 'z2']),
    };
    const result = acceptFirst(
      hand,
      winning,
      'structure.standard-four-groups-pair.fixed-1',
      [invalidMeld],
    );
    expect(result.receipt.outcome).toBe('rejected');
    expect(result.receipt.failures.map((entry) => entry.id))
      .toContain('interpretation.submit-response.fixed-groups');
    expect(accepted(result.value, 'track:hand-interpretations', 'interpretations')).toEqual([]);
    expect(accepted(result.value, 'track:fixed-meld-interpretation-contexts', 'fixedGroupContexts')).toEqual([]);
    expect(accepted(result.value, 'track:wait-classifications', 'waitClassifications')).toEqual([]);
    expect(result.value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'can-win-on')).toEqual([]);
    expect(result.value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'has-hand-shape')).toEqual([]);
  });
});

describe('source-group wait classification', () => {
  const cases: Array<{
    name: string;
    hand: string[];
    winning: string;
    expected: string;
  }> = [
    {
      name: 'single wait',
      hand: ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z1', 'z1', 'm9'],
      winning: 'm9',
      expected: 'single',
    },
    {
      name: 'double-pair wait',
      hand: ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z1', 'm9', 'm9'],
      winning: 'z1',
      expected: 'double-pair',
    },
    {
      name: 'closed wait',
      hand: ['m2', 'm4', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z1', 'z1', 'm9', 'm9'],
      winning: 'm3',
      expected: 'closed',
    },
    {
      name: 'edge wait',
      hand: ['m1', 'm2', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z1', 'z1', 'm9', 'm9'],
      winning: 'm3',
      expected: 'edge',
    },
    {
      name: 'two-sided wait',
      hand: ['m2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z1', 'z1', 'm9', 'm9'],
      winning: 'm4',
      expected: 'two-sided',
    },
  ];

  for (const testCase of cases) {
    it(`classifies ${testCase.name}`, () => {
      const hand = numbered(`hand:${testCase.expected}`, testCase.hand);
      const winning = tile(`winning:${testCase.expected}`, testCase.winning);
      const result = acceptFirst(hand, winning, 'structure.standard-four-groups-pair');
      expect(result.receipt.outcome).toBe('executed');
      expect(accepted(result.value, 'track:wait-classifications', 'waitClassifications')[0])
        .toMatchObject({ classification: testCase.expected, sourceEntityId: winning.id });
    });
  }
});
