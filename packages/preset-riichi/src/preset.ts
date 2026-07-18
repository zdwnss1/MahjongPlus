import type {
  ActionDefinition,
  ProcedureDefinition,
  WorldSource,
} from '@mahjongplus/world-language';
import type { EntityRecord, RelationRecord, ZoneRecord } from '@mahjongplus/world-model';
import { PresetRandom } from './random.js';
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

const literal = (value: unknown) => ({ kind: 'literal', value } as const);
const context = (path: string) => ({ kind: 'context', path } as const);
const template = (value: string) => ({ kind: 'template', template: value } as const);

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
    for (let copy = 0; copy < total - variantCount; copy += 1) {
      entities.push({
        id: `tile:${face}:normal:${copy}`,
        kind: 'tile',
        components: {
          tile: {
            prototypeId: `tile-kind:${face}:normal`,
            baseFace: face,
            effectiveFaces: [face],
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
              prototypeId: `tile-kind:${face}:${variant.id}`,
              baseFace: face,
              effectiveFaces: [face],
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

function zone(id: string, kind: string, entityIds: string[] = [], metadata: Record<string, unknown> = {}): ZoneRecord {
  return {
    id,
    kind,
    ordered: true,
    entries: entityIds.map((entityId, ordinal) => ({
      slotId: `${id}:slot:${ordinal}`,
      entityId,
      ordinal,
      metadata: {},
    })),
    metadata,
  };
}

function procedures(): ProcedureDefinition[] {
  return [
    {
      id: 'hand.setup',
      entryNodeId: 'deal',
      nodes: [
        {
          id: 'deal',
          onEnter: [
            {
              kind: 'zone.distribute',
              sourceZone: literal('wall.live'),
              destinationZones: TURN_ORDER.map((seat) => literal(`hand:${seat}`)),
              batchPattern: [4, 4, 4, 1],
            },
            {
              kind: 'procedure.spawn',
              procedureId: 'turn',
              nodeId: 'await-draw',
              owner: literal('east'),
              tokenId: literal('procedure-token:turn'),
            },
            { kind: 'procedure.transition', nodeId: 'complete' },
          ],
        },
        { id: 'complete' },
      ],
    },
    {
      id: 'turn',
      entryNodeId: 'await-draw',
      nodes: [
        { id: 'await-draw' },
        { id: 'await-discard' },
      ],
    },
  ];
}

function actions(): ActionDefinition[] {
  return [
    {
      id: 'draw',
      parameters: {},
      requirements: [
        {
          id: 'draw.correct-turn',
          kind: 'procedure-token',
          procedureId: 'turn',
          nodeId: 'await-draw',
          owner: 'actor',
          message: 'It is not this player’s normal draw opportunity.',
        },
        {
          id: 'draw.live-wall-not-empty',
          kind: 'zone-not-empty',
          zone: literal('wall.live'),
          message: 'The live wall is empty.',
        },
      ],
      effects: [
        {
          kind: 'zone.move-head',
          fromZone: literal('wall.live'),
          toZone: template('hand:${actorId}'),
        },
        {
          kind: 'event.emit',
          eventType: 'tile.drawn',
          subjects: [{ kind: 'actor' }],
          objects: [{ kind: 'last-moved-entity', entityKind: 'tile' }],
          payload: { tileId: { kind: 'last-moved-entity' } },
        },
        { kind: 'procedure.transition', nodeId: 'await-discard' },
      ],
    },
    {
      id: 'discard',
      parameters: { tileId: 'string' },
      requirements: [
        {
          id: 'discard.correct-turn',
          kind: 'procedure-token',
          procedureId: 'turn',
          nodeId: 'await-discard',
          owner: 'actor',
          message: 'It is not this player’s normal discard opportunity.',
        },
        {
          id: 'discard.tile-required',
          kind: 'parameter-present',
          parameter: 'tileId',
          message: 'Discard requires a physical tile id.',
        },
        {
          id: 'discard.tile-in-hand',
          kind: 'entity-in-zone',
          entity: context('params.tileId'),
          zone: template('hand:${actorId}'),
          message: 'The selected physical tile is not in the player’s hand.',
        },
      ],
      effects: [
        {
          kind: 'zone.move-entity',
          entity: context('params.tileId'),
          fromZone: template('hand:${actorId}'),
          toZone: template('river:${actorId}'),
          metadata: { orientation: 'upright' },
        },
        {
          kind: 'event.emit',
          eventType: 'tile.discarded',
          subjects: [{ kind: 'actor' }],
          objects: [{ kind: 'last-moved-entity', entityKind: 'tile' }],
          payload: { tileId: context('params.tileId') },
        },
        { kind: 'procedure.rotate-owner', order: [...TURN_ORDER], nodeId: 'await-draw' },
      ],
    },
  ];
}

export function createRiichiWorldSource(options: RiichiWorldOptions): WorldSource {
  const dealer = options.dealer ?? 'east';
  const entities = createTiles(options);
  const random = new PresetRandom(options.seed);
  const shuffledIds = random.fork('tiles').shuffle(entities.map((entity) => entity.id));
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
    components: { wallStack: { side: stack.side, indexFromRight: stack.indexFromRight, height: stack.tileIdsTopToBottom.length } },
  }));
  const dice: EntityRecord = {
    id: 'dice:opening',
    kind: 'dice-roll',
    components: { dice: { values: opening.diceValues, total: opening.diceTotal, roller: dealer } },
  };
  const relations: RelationRecord[] = opening.stacks.flatMap((stack) => stack.tileIdsTopToBottom.map((tileId, level) => ({
    id: `relation:${stack.id}:contains:${level}`,
    type: 'contains',
    source: { kind: 'wall-stack', id: stack.id },
    target: { kind: 'tile', id: tileId },
    metadata: { level },
  })));
  const zones: ZoneRecord[] = [
    zone('wall.live', 'wall-live', opening.liveTileOrder, { liveStartStackId: opening.liveStartStackId }),
    zone('wall.dead', 'wall-dead', opening.deadWallTileOrder, { deadWallTileCount: wallPolicy.deadWallTileCount }),
    ...TURN_ORDER.flatMap((seat) => [zone(`hand:${seat}`, 'hand'), zone(`river:${seat}`, 'river', [], { columnsPerRow: 6 })]),
  ];

  return {
    schemaVersion: 'mwl/0.1',
    id: options.id ?? `riichi-common:${options.seed}`,
    entities: [...players, ...entities, ...wallStacks, dice],
    zones,
    relations,
    actions: actions(),
    procedures: procedures(),
    bootstrap: [{ procedureId: 'hand.setup', ownerId: dealer, tokenId: 'procedure-token:hand.setup' }],
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
      preset: 'riichi/common',
      seed: options.seed,
      dealer,
      wallPolicy,
      opening: {
        diceValues: opening.diceValues,
        selectedSide: opening.selectedSide,
        countedStackId: opening.countedStackId,
        liveStartStackId: opening.liveStartStackId,
      },
    },
  };
}
