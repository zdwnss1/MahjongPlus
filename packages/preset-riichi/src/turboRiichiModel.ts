import type { EntityRecord, RelationRecord, ZoneRecord } from '@mahjongplus/world-model';
import { zone } from './fixtureDsl.js';
import {
  TURBO_PLAYERS,
  type TurboRiichiOptions,
  type TurboRiichiPolicy,
  type TurboRiichiSeat,
} from './turboRiichiTypes.js';

export interface TurboRiichiModel {
  policy: TurboRiichiPolicy;
  entities: EntityRecord[];
  zones: ZoneRecord[];
  relations: RelationRecord[];
  entityIndex(id: string): string;
  ids: {
    tripletIds: string[];
    initialDrawId: string;
    firstWallTileId: string;
  };
}

function normalizeOptions(options: TurboRiichiOptions): TurboRiichiPolicy {
  const policy: TurboRiichiPolicy = {
    id: options.id ?? 'rule:turbo-riichi',
    declarerId: options.declarerId ?? 'east',
    proofFace: options.proofFace ?? 'm7',
    stake: options.stake ?? 1000,
    riichiHan: options.riichiHan ?? 1,
    maxWinsPerPlayer: options.maxWinsPerPlayer ?? null,
    startingPoints: options.startingPoints ?? 25000,
    wallTileCount: options.wallTileCount ?? 8,
  };
  if (!TURBO_PLAYERS.includes(policy.declarerId)) throw new Error('Turbo-riichi declarer must be a seat id.');
  if (!['m7', 'p7', 's7'].includes(policy.proofFace)) throw new Error('Turbo-riichi proof face must be a suited seven.');
  for (const [name, value] of Object.entries(policy)) {
    if (typeof value === 'number' && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`${name} must be a non-negative integer.`);
    }
  }
  if (policy.stake < 1) throw new Error('Turbo-riichi stake must be positive.');
  if (policy.maxWinsPerPlayer != null && policy.maxWinsPerPlayer < 1) {
    throw new Error('maxWinsPerPlayer must be positive or null.');
  }
  if (policy.wallTileCount < 1) throw new Error('wallTileCount must be positive.');
  return policy;
}

function tile(id: string, baseFace: string): EntityRecord {
  return {
    id,
    kind: 'tile',
    components: {
      tile: {
        baseFace,
        suit: baseFace[0],
        rank: Number(baseFace[1]),
        traits: [],
      },
    },
  };
}

function factTrack(id: string, component: string): EntityRecord {
  return { id, kind: 'fact-track', components: { [component]: { records: [] } } };
}

export function createTurboRiichiModel(options: TurboRiichiOptions = {}): TurboRiichiModel {
  const policy = normalizeOptions(options);
  const declarer = policy.declarerId;
  const tripletIds = Array.from({ length: 3 }, (_, index) => `tile:${declarer}:${policy.proofFace}:${index}`);
  const initialDrawId = `tile:${declarer}:initial-draw`;
  const firstWallTileId = 'tile:wall:0';
  const handIds: Record<TurboRiichiSeat, string[]> = { east: [], south: [], west: [], north: [] };
  const tiles: EntityRecord[] = [];

  for (const seat of TURBO_PLAYERS) {
    if (seat === declarer) {
      tripletIds.forEach((id) => {
        handIds[seat].push(id);
        tiles.push(tile(id, policy.proofFace));
      });
      for (let index = 0; index < 10; index += 1) {
        const id = `tile:${seat}:filler:${index}`;
        handIds[seat].push(id);
        tiles.push(tile(id, `${['m', 'p', 's'][index % 3]}${(index % 9) + 1}`));
      }
      handIds[seat].push(initialDrawId);
      tiles.push(tile(initialDrawId, 'p5'));
    } else {
      for (let index = 0; index < 13; index += 1) {
        const id = `tile:${seat}:filler:${index}`;
        handIds[seat].push(id);
        tiles.push(tile(id, `${['m', 'p', 's'][index % 3]}${(index % 9) + 1}`));
      }
    }
  }

  const wallIds = Array.from({ length: policy.wallTileCount }, (_, index) => `tile:wall:${index}`);
  wallIds.forEach((id, index) => tiles.push(tile(id, index === 0 ? 's9' : `p${(index % 9) + 1}`)));
  const players: EntityRecord[] = TURBO_PLAYERS.map((seat) => ({
    id: seat,
    kind: 'player',
    components: {
      seat: { seat },
      riichi: { eligible: seat === declarer },
      handState: { closed: true },
    },
  }));
  const ledger: EntityRecord = {
    id: 'ledger:points',
    kind: 'resource-ledger',
    components: {
      ledger: {
        asset: 'points',
        accounts: [
          ...TURBO_PLAYERS.map((id) => ({ id, balance: policy.startingPoints })),
          { id: 'riichi-pot', balance: 0 },
        ],
      },
    },
  };
  const tracks = [
    factTrack('track:resource-transfers', 'resourceTransfers'),
    factTrack('track:declarations', 'declarations'),
    factTrack('track:score-contributions', 'scoreContributions'),
    factTrack('track:discard-policies', 'discardPolicies'),
    factTrack('track:furiten-policies', 'furitenPolicies'),
    factTrack('track:visibility', 'visibility'),
    factTrack('track:wins', 'wins'),
    factTrack('track:response-batches', 'responseBatches'),
  ];
  const rule: EntityRecord = {
    id: policy.id,
    kind: 'rule-instance',
    components: { rulePolicy: structuredClone(policy) },
  };
  const entities = [...players, ledger, ...tracks, rule, ...tiles];
  const indices = new Map(entities.map((entity, index) => [entity.id, index]));
  const entityIndex = (id: string): string => {
    const value = indices.get(id);
    if (value == null) throw new Error(`Missing fixture entity ${id}.`);
    return String(value);
  };
  const zones = [
    zone('wall.live', 'wall-live', wallIds),
    ...TURBO_PLAYERS.flatMap((seat) => [
      zone(`hand:${seat}`, 'hand', handIds[seat]),
      zone(`river:${seat}`, 'river'),
    ]),
  ];
  const relations: RelationRecord[] = [
    { id: 'relation:south:initial', type: 'can-win-on', source: { kind: 'player', id: 'south' }, target: { kind: 'tile', id: initialDrawId }, metadata: {} },
    { id: 'relation:west:initial', type: 'can-win-on', source: { kind: 'player', id: 'west' }, target: { kind: 'tile', id: initialDrawId }, metadata: {} },
    { id: 'relation:south:wall0', type: 'can-win-on', source: { kind: 'player', id: 'south' }, target: { kind: 'tile', id: firstWallTileId }, metadata: {} },
    { id: 'relation:east:wall0', type: 'can-win-on', source: { kind: 'player', id: 'east' }, target: { kind: 'tile', id: firstWallTileId }, metadata: {} },
    { id: 'relation:west:wall0', type: 'can-win-on', source: { kind: 'player', id: 'west' }, target: { kind: 'tile', id: firstWallTileId }, metadata: {} },
  ];

  return {
    policy,
    entities,
    zones,
    relations,
    entityIndex,
    ids: { tripletIds, initialDrawId, firstWallTileId },
  };
}
