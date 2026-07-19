import { instantiateRuleModule, type WorldSource } from '@mahjongplus/world-language';
import type { EntityRecord, RelationRecord, ZoneRecord } from '@mahjongplus/world-model';
import { PresetRandom } from './random.js';
import { RIICHI_COMMON_FLOW_MODULE } from './riichiCommonFlowModule.js';
import {
  createWallOpening,
  STANDARD_WALL_POLICY,
  TURN_ORDER,
  type RiichiSeat,
  type WallPolicy,
} from './wall.js';

export interface TileScoreContributionDefinition {
  phase: 'qualification' | 'han' | 'fu' | 'limit' | 'settlement';
  amount: number;
  eventType: string;
  contextTags?: string[];
  label: string;
}

export interface TileVariantDefinition {
  id: string;
  face: string;
  count: number;
  appearance?: Record<string, unknown>;
  traits?: string[];
  scoreContributions?: TileScoreContributionDefinition[];
}

export interface RiichiWorldOptions {
  id?: string;
  seed: string;
  dealer?: RiichiSeat;
  copiesPerFace?: number;
  extraCopies?: Record<string, number>;
  variants?: TileVariantDefinition[];
  wallPolicy?: Partial<WallPolicy>;
}

function standardFaces(): string[] {
  const faces: string[] = [];
  for (const suit of ['m', 'p', 's', 'z']) {
    const maximum = suit === 'z' ? 7 : 9;
    for (let rank = 1; rank <= maximum; rank += 1) faces.push(`${suit}${rank}`);
  }
  return faces;
}

function createTiles(options: RiichiWorldOptions): EntityRecord[] {
  const copiesPerFace = options.copiesPerFace ?? 4;
  const variantsByFace = new Map<string, TileVariantDefinition[]>();
  for (const variant of options.variants ?? []) {
    const list = variantsByFace.get(variant.face) ?? [];
    list.push(variant);
    variantsByFace.set(variant.face, list);
  }

  const entities: EntityRecord[] = [];
  for (const face of standardFaces()) {
    const total = copiesPerFace + (options.extraCopies?.[face] ?? 0);
    const variants = variantsByFace.get(face) ?? [];
    const variantCount = variants.reduce((sum, variant) => sum + variant.count, 0);
    if (variantCount > total) throw new Error(`Tile variants exceed copy count for ${face}.`);
    const common = {
      baseFace: face,
      suit: face[0],
      rank: Number(face[1]),
      effectiveFaces: [face],
    };
    for (let copy = 0; copy < total - variantCount; copy += 1) {
      entities.push({
        id: `tile:${face}:normal:${copy}`,
        kind: 'tile',
        components: {
          tile: {
            ...common,
            prototypeId: `tile-kind:${face}:normal`,
            traits: [],
            appearance: {},
            scoreContributions: [],
          },
        },
      });
    }
    for (const variant of variants) {
      for (let copy = 0; copy < variant.count; copy += 1) {
        entities.push({
          id: `tile:${face}:${variant.id}:${copy}`,
          kind: 'tile',
          components: {
            tile: {
              ...common,
              prototypeId: `tile-kind:${face}:${variant.id}`,
              traits: [...new Set(variant.traits ?? [])],
              appearance: structuredClone(variant.appearance ?? {}),
              scoreContributions: structuredClone(variant.scoreContributions ?? []),
            },
          },
        });
      }
    }
  }
  return entities;
}

function zone(
  id: string,
  kind: string,
  entityIds: string[] = [],
  metadata: Record<string, unknown> = {},
): ZoneRecord {
  return {
    id,
    kind,
    ordered: true,
    entries: entityIds.map((entityId, ordinal) => ({
      slotId: `${id}:slot:${ordinal}`,
      entityId,
      ordinal,
      metadata: {},
      state: 'occupied',
    })),
    metadata,
  };
}

/**
 * Builds only the physical starting world. Rule semantics such as dealing,
 * turns, calls, response priority and preliminary win claims are installed by
 * declarative modules.
 */
export function createRiichiPhysicalWorldSource(options: RiichiWorldOptions): WorldSource {
  const dealer = options.dealer ?? 'east';
  const tiles = createTiles(options);
  const random = new PresetRandom(options.seed);
  const shuffledIds = random.fork('tiles').shuffle(tiles.map((entity) => entity.id));
  const wallPolicy: WallPolicy = { ...STANDARD_WALL_POLICY, ...(options.wallPolicy ?? {}) };
  const opening = createWallOpening(shuffledIds, dealer, random.fork('dice'), wallPolicy);

  const players: EntityRecord[] = TURN_ORDER.map((seat) => ({
    id: seat,
    kind: 'player',
    components: { seat: { seat }, score: { value: 25000 } },
  }));
  const wallStacks: EntityRecord[] = opening.stacks.map((stack) => ({
    id: stack.id,
    kind: 'wall-stack',
    components: {
      wallStack: {
        side: stack.side,
        indexFromRight: stack.indexFromRight,
        height: stack.tileIdsTopToBottom.length,
      },
    },
  }));
  const dice: EntityRecord = {
    id: 'dice:opening',
    kind: 'dice-roll',
    components: { dice: { values: opening.diceValues, total: opening.diceTotal, roller: dealer } },
  };
  const relations: RelationRecord[] = opening.stacks.flatMap((stack) =>
    stack.tileIdsTopToBottom.map((tileId, level) => ({
      id: `relation:${stack.id}:contains:${level}`,
      type: 'contains',
      source: { kind: 'wall-stack', id: stack.id },
      target: { kind: 'tile', id: tileId },
      metadata: { level },
    })));
  const zones: ZoneRecord[] = [
    zone('wall.live', 'wall-live', opening.liveTileOrder, { liveStartStackId: opening.liveStartStackId }),
    zone('wall.dead', 'wall-dead', opening.deadWallTileOrder, { deadWallTileCount: wallPolicy.deadWallTileCount }),
    ...TURN_ORDER.flatMap((seat) => [
      zone(`hand:${seat}`, 'hand'),
      zone(`river:${seat}`, 'river', [], { columnsPerRow: 6 }),
      zone(`melds:${seat}`, 'melds'),
      zone(`meld-tiles:${seat}`, 'meld-tiles'),
    ]),
  ];

  return {
    schemaVersion: 'mwl/0.6',
    id: options.id ?? `riichi-physical:${options.seed}`,
    entities: [...players, ...tiles, ...wallStacks, dice],
    zones,
    relations,
    actions: [],
    procedures: [],
    responseWindows: [],
    corePrograms: { constraints: [], reducers: [], rewrites: [] },
    bootstrap: [],
    initialEvents: [{
      id: 'event:wall.opened',
      type: 'wall.opened',
      subjects: [{ kind: 'player', id: dealer }],
      objects: [{ kind: 'dice-roll', id: dice.id }, { kind: 'wall-stack', id: opening.liveStartStackId }],
      payload: {
        diceValues: opening.diceValues,
        diceTotal: opening.diceTotal,
        selectedSide: opening.selectedSide,
        countedStackId: opening.countedStackId,
        liveStartStackId: opening.liveStartStackId,
        sideStackCounts: opening.sideStackCounts,
      },
    }],
    metadata: {
      preset: 'riichi/physical',
      seed: options.seed,
      dealer,
      wallPolicy,
      hostBoundary: {
        deterministicRandom: true,
        semanticRules: false,
      },
    },
  };
}

export function createRiichiWorldSource(options: RiichiWorldOptions): WorldSource {
  const dealer = options.dealer ?? 'east';
  const physical = createRiichiPhysicalWorldSource(options);
  const result = instantiateRuleModule(physical, {
    definition: RIICHI_COMMON_FLOW_MODULE,
    bindings: {
      playerIds: [...TURN_ORDER],
      dealerId: dealer,
      liveZoneId: 'wall.live',
    },
  });
  result.world.id = options.id ?? `riichi-common:${options.seed}`;
  result.world.metadata = {
    ...(result.world.metadata ?? {}),
    preset: 'riichi/common',
  };
  return result.world;
}
