import type { WorldSource } from '@mahjongplus/world-language';

export interface PhysicalFixtureOptions {
  playerIds?: string[];
  startingPoints?: number;
  liveWallTileCount?: number;
  deadWallTileCount?: number;
}

export interface PhysicalFixture {
  source: WorldSource;
  bindings: {
    playerIds: string[];
    ledgerId: string;
    liveZoneId: string;
    deadZoneId: string;
    indicatorCandidates: Array<{ tileId: string; ordinal: number }>;
  };
  ids: {
    liveTileIds: string[];
    deadTileIds: string[];
  };
}

export function buildPhysicalFixture(options: PhysicalFixtureOptions = {}): PhysicalFixture {
  const playerIds = options.playerIds ?? ['east', 'south', 'west', 'north'];
  const startingPoints = options.startingPoints ?? 25_000;
  const liveWallTileCount = options.liveWallTileCount ?? 24;
  const deadWallTileCount = options.deadWallTileCount ?? 14;
  const liveTileIds = Array.from({ length: liveWallTileCount }, (_, index) => `tile:live:${index}`);
  const deadTileIds = Array.from({ length: deadWallTileCount }, (_, index) => `tile:dead:${index}`);
  const indicatorCandidates = deadTileIds
    .filter((_id, index) => index % 2 === 0)
    .map((tileId, ordinal) => ({ tileId, ordinal }));

  const entities = [
    ...playerIds.map((id) => ({
      id,
      kind: 'player',
      components: { riichi: { eligible: true } },
    })),
    {
      id: 'ledger:points',
      kind: 'resource-ledger',
      components: {
        ledger: {
          asset: 'points',
          accounts: [
            ...playerIds.map((id) => ({ id, balance: startingPoints })),
            { id: 'riichi-pot', balance: 0 },
          ],
        },
      },
    },
    ...[...liveTileIds, ...deadTileIds].map((id) => ({
      id,
      kind: 'tile',
      components: { tile: { baseFace: 'x', traits: [] } },
    })),
  ];
  const zone = (id: string, kind: string, entityIds: string[]) => ({
    id,
    kind,
    ordered: true,
    entries: entityIds.map((entityId, ordinal) => ({
      slotId: `physical-wall-slot:${entityId}`,
      entityId,
      ordinal,
      metadata: {},
      state: 'occupied' as const,
    })),
    metadata: {},
  });

  return {
    source: {
      schemaVersion: 'mwl/0.6',
      id: 'fixture:physical-table',
      entities,
      zones: [
        zone('wall.live', 'wall-live', liveTileIds),
        zone('wall.dead', 'wall-dead', deadTileIds),
      ],
      relations: [],
      actions: [],
      procedures: [],
      responseWindows: [],
      corePrograms: { constraints: [], reducers: [], rewrites: [] },
      bootstrap: [],
    },
    bindings: {
      playerIds,
      ledgerId: 'ledger:points',
      liveZoneId: 'wall.live',
      deadZoneId: 'wall.dead',
      indicatorCandidates,
    },
    ids: { liveTileIds, deadTileIds },
  };
}
