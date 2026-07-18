import type {
  ActionDefinition,
  EffectDefinition,
  ProcedureDefinition,
  ResponseWindowDefinition,
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
        { id: 'await-response' },
        { id: 'await-kan-draw' },
        { id: 'await-win-resolution' },
      ],
    },
  ];
}

function makeMeldEffects(
  callType: 'pon' | 'chi' | 'open-kan',
  nextNode: 'await-discard' | 'await-kan-draw',
): EffectDefinition[] {
  return [
    {
      kind: 'entity.create',
      entityId: template('meld:${window.id}:${actorId}'),
      entityKind: 'meld',
      components: {
        meld: {
          callType,
          ownerId: context('actorId'),
          sourceEventId: context('window.sourceEventId'),
          calledTileId: context('window.sourceEntityId'),
          tileIds: context('params.tileIds'),
        },
      },
    },
    {
      kind: 'zone.place-entity',
      entity: { kind: 'last-created-entity' },
      zone: template('melds:${actorId}'),
    },
    {
      kind: 'zone.claim-entity',
      entity: context('window.sourceEntityId'),
      fromZone: template('river:${window.sourceActorId}'),
      toZone: template('meld-tiles:${actorId}'),
    },
    {
      kind: 'zone.move-entities',
      entities: context('params.tileIds'),
      fromZone: template('hand:${actorId}'),
      toZone: template('meld-tiles:${actorId}'),
    },
    {
      kind: 'relation.connect',
      relationType: 'contains',
      source: { kind: 'last-created-entity', entityKind: 'meld' },
      target: { kind: 'window-source-entity', entityKind: 'tile' },
    },
    {
      kind: 'relation.connect-many',
      relationType: 'contains',
      source: { kind: 'last-created-entity', entityKind: 'meld' },
      targetKind: 'tile',
      targetIds: context('params.tileIds'),
    },
    {
      kind: 'event.emit',
      eventType: 'meld.committed',
      subjects: [{ kind: 'actor' }, { kind: 'last-created-entity', entityKind: 'meld' }],
      objects: [{ kind: 'window-source-entity', entityKind: 'tile' }, { kind: 'window-source-event' }],
      payload: { callType },
    },
    {
      kind: 'procedure.set-owner',
      tokenId: context('window.parentTokenId'),
      owner: context('actorId'),
      nodeId: nextNode,
    },
  ];
}

function responseWindows(): ResponseWindowDefinition[] {
  return [{
    id: 'riichi.discard-response',
    allowedActionIds: ['response.pass', 'ron', 'pon', 'chi', 'open-kan'],
    participantOrder: [...TURN_ORDER],
    excludeSourceActor: true,
    tiers: [
      { actionIds: ['ron'], selection: 'all', maxSelections: 3 },
      { actionIds: ['open-kan', 'pon'], selection: 'single' },
      { actionIds: ['chi'], selection: 'single' },
    ],
    noSelectionEffects: [{
      kind: 'procedure.rotate-owner',
      tokenId: context('window.parentTokenId'),
      order: [...TURN_ORDER],
      nodeId: 'await-draw',
    }],
    selectionEffects: {
      ron: [
        {
          kind: 'event.emit',
          eventType: 'win.claimed',
          subjects: [{ kind: 'actor' }],
          objects: [{ kind: 'window-source-entity', entityKind: 'tile' }, { kind: 'window-source-event' }],
          payload: { mode: 'ron' },
        },
        {
          kind: 'procedure.transition',
          tokenId: context('window.parentTokenId'),
          nodeId: 'await-win-resolution',
        },
      ],
      pon: makeMeldEffects('pon', 'await-discard'),
      chi: makeMeldEffects('chi', 'await-discard'),
      'open-kan': makeMeldEffects('open-kan', 'await-kan-draw'),
    },
  }];
}

function responseAction(
  id: string,
  extraRequirements: ActionDefinition['requirements'] = [],
): ActionDefinition {
  return {
    id,
    parameters: { windowId: 'string' },
    requirements: [
      {
        id: `${id}.window-open`,
        kind: 'response-window-open',
        windowId: context('params.windowId'),
        message: 'This response window is not open for the player.',
      },
      ...extraRequirements,
    ],
    effects: [{ kind: 'response-window.submit', windowId: context('params.windowId') }],
  };
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
        { kind: 'zone.move-head', fromZone: literal('wall.live'), toZone: template('hand:${actorId}') },
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
        { kind: 'procedure.transition', nodeId: 'await-response' },
        {
          kind: 'response-window.open',
          definitionId: 'riichi.discard-response',
          windowId: template('response:${lastEventId}'),
          sourceActor: context('actorId'),
          sourceEvent: context('lastEventId'),
          sourceEntity: context('params.tileId'),
          parentTokenId: context('token.id'),
        },
      ],
    },
    responseAction('response.pass'),
    responseAction('ron', [{
      id: 'ron.eligible',
      kind: 'relation-exists',
      source: { kind: 'actor' },
      target: { kind: 'window-source-entity', entityKind: 'tile' },
      relationType: 'can-win-on',
      message: 'No win-interpretation module marked this tile as a valid ron.',
    }]),
    {
      ...responseAction('pon', [
        { id: 'pon.tiles-required', kind: 'parameter-present', parameter: 'tileIds', message: 'Pon requires two hand tile ids.' },
        { id: 'pon.two-tiles', kind: 'array-length', value: context('params.tileIds'), length: 2, message: 'Pon requires exactly two hand tiles.' },
        { id: 'pon.distinct', kind: 'entities-distinct', entities: context('params.tileIds'), message: 'Pon tiles must be distinct physical entities.' },
        { id: 'pon.in-hand', kind: 'entities-in-zone', entities: context('params.tileIds'), zone: template('hand:${actorId}'), message: 'Pon tiles must be in the player hand.' },
        { id: 'pon.same-face', kind: 'entities-component-equal', entities: context('params.tileIds'), includeEntity: context('window.sourceEntityId'), componentPath: 'tile.baseFace', message: 'Pon tiles must match the discarded tile.' },
      ]),
      parameters: { windowId: 'string', tileIds: 'string[]' },
    },
    {
      ...responseAction('open-kan', [
        { id: 'open-kan.tiles-required', kind: 'parameter-present', parameter: 'tileIds', message: 'Open kan requires three hand tile ids.' },
        { id: 'open-kan.three-tiles', kind: 'array-length', value: context('params.tileIds'), length: 3, message: 'Open kan requires exactly three hand tiles.' },
        { id: 'open-kan.distinct', kind: 'entities-distinct', entities: context('params.tileIds'), message: 'Kan tiles must be distinct physical entities.' },
        { id: 'open-kan.in-hand', kind: 'entities-in-zone', entities: context('params.tileIds'), zone: template('hand:${actorId}'), message: 'Kan tiles must be in hand.' },
        { id: 'open-kan.same-face', kind: 'entities-component-equal', entities: context('params.tileIds'), includeEntity: context('window.sourceEntityId'), componentPath: 'tile.baseFace', message: 'Open kan tiles must match the discard.' },
      ]),
      parameters: { windowId: 'string', tileIds: 'string[]' },
    },
    {
      ...responseAction('chi', [
        { id: 'chi.next-player', kind: 'actor-relative-position', sourceActor: context('window.sourceActorId'), order: [...TURN_ORDER], offset: 1, message: 'Only the next player may chi.' },
        { id: 'chi.tiles-required', kind: 'parameter-present', parameter: 'tileIds', message: 'Chi requires two hand tile ids.' },
        { id: 'chi.two-tiles', kind: 'array-length', value: context('params.tileIds'), length: 2, message: 'Chi requires exactly two hand tiles.' },
        { id: 'chi.distinct', kind: 'entities-distinct', entities: context('params.tileIds'), message: 'Chi tiles must be distinct.' },
        { id: 'chi.in-hand', kind: 'entities-in-zone', entities: context('params.tileIds'), zone: template('hand:${actorId}'), message: 'Chi tiles must be in hand.' },
        { id: 'chi.same-suit', kind: 'entities-component-equal', entities: context('params.tileIds'), includeEntity: context('window.sourceEntityId'), componentPath: 'tile.suit', message: 'Chi tiles must share a suit.' },
        { id: 'chi.sequence', kind: 'entities-component-consecutive', entities: context('params.tileIds'), includeEntity: context('window.sourceEntityId'), componentPath: 'tile.rank', expectedCount: 3, message: 'Chi tiles must form a three-tile sequence.' },
      ]),
      parameters: { windowId: 'string', tileIds: 'string[]' },
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
    schemaVersion: 'mwl/0.2',
    id: options.id ?? `riichi-common:${options.seed}`,
    entities: [...players, ...entities, ...wallStacks, dice],
    zones,
    relations,
    actions: actions(),
    procedures: procedures(),
    responseWindows: responseWindows(),
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
    metadata: { preset: 'riichi/common', seed: options.seed, dealer, wallPolicy },
  };
}
