import type { RuleModuleDefinition } from '@mahjongplus/world-language';

const actor = { kind: 'actor' } as const;
const context = (path: string) => ({ kind: 'context', path } as const);
const template = (value: string) => ({ kind: 'template', template: value } as const);
const literal = (value: unknown) => ({ kind: 'literal', value } as const);
const lastCreatedMeld = { kind: 'last-created-entity', entityKind: 'meld' } as const;
const windowTile = { kind: 'window-source-entity', entityKind: 'tile' } as const;
const windowEvent = { kind: 'window-source-event' } as const;

const destinationHandZones = {
  $module: 'map',
  source: { $module: 'ref', path: 'bindings.playerIds' },
  as: 'seat',
  value: {
    kind: 'literal',
    value: { $module: 'template', value: 'hand:${locals.seat}' },
  },
};

const responseWindowOpenRequirement = (id: string) => ({
  id: `${id}.window-open`,
  kind: 'response-window-open',
  windowId: context('params.windowId'),
  message: 'This response window is not open for the player.',
});

const responseSubmit = {
  kind: 'response-window.submit',
  windowId: context('params.windowId'),
};

const meldEffects = (
  callType: 'pon' | 'chi' | 'open-kan',
  nextNode: 'await-discard' | 'await-kan-draw',
) => [
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
    source: lastCreatedMeld,
    target: windowTile,
  },
  {
    kind: 'relation.connect-many',
    relationType: 'contains',
    source: lastCreatedMeld,
    targetKind: 'tile',
    targetIds: context('params.tileIds'),
  },
  {
    kind: 'event.emit',
    eventType: 'meld.committed',
    subjects: [actor, lastCreatedMeld],
    objects: [windowTile, windowEvent],
    payload: { callType },
  },
  {
    kind: 'procedure.set-owner',
    tokenId: context('window.parentTokenId'),
    owner: context('actorId'),
    nodeId: nextNode,
  },
];

export const RIICHI_COMMON_FLOW_MODULE: RuleModuleDefinition = {
  id: 'riichi.common-flow',
  version: '1.0.0',
  title: 'Common riichi physical flow',
  description: 'Standard deal, turn, discard-response, call and preliminary win-claim procedures over physical tile entities.',
  requiredBindings: ['playerIds', 'dealerId', 'liveZoneId'],
  additions: {
    procedures: [
      {
        id: 'hand.setup',
        entryNodeId: 'deal',
        nodes: [
          {
            id: 'deal',
            onEnter: [
              {
                kind: 'zone.distribute',
                sourceZone: {
                  kind: 'literal',
                  value: { $module: 'ref', path: 'bindings.liveZoneId' },
                },
                destinationZones: destinationHandZones,
                batchPattern: [4, 4, 4, 1],
              },
              {
                kind: 'procedure.spawn',
                procedureId: 'turn',
                nodeId: 'await-draw',
                owner: {
                  kind: 'literal',
                  value: { $module: 'ref', path: 'bindings.dealerId' },
                },
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
    ],
    responseWindows: [
      {
        id: 'riichi.discard-response',
        allowedActionIds: ['response.pass', 'ron', 'pon', 'chi', 'open-kan'],
        participantOrder: { $module: 'ref', path: 'bindings.playerIds' },
        excludeSourceActor: true,
        tiers: [
          { actionIds: ['ron'], selection: 'all', maxSelections: 3 },
          { actionIds: ['open-kan', 'pon'], selection: 'single' },
          { actionIds: ['chi'], selection: 'single' },
        ],
        noSelectionEffects: [
          {
            kind: 'procedure.rotate-owner',
            tokenId: context('window.parentTokenId'),
            order: { $module: 'ref', path: 'bindings.playerIds' },
            nodeId: 'await-draw',
          },
        ],
        selectionEffects: {
          ron: [
            {
              kind: 'event.emit',
              eventType: 'win.claimed',
              subjects: [actor],
              objects: [windowTile, windowEvent],
              payload: { mode: 'ron' },
            },
            {
              kind: 'procedure.transition',
              tokenId: context('window.parentTokenId'),
              nodeId: 'await-win-resolution',
            },
          ],
          pon: meldEffects('pon', 'await-discard'),
          chi: meldEffects('chi', 'await-discard'),
          'open-kan': meldEffects('open-kan', 'await-kan-draw'),
        },
      },
    ],
    actions: [
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
            zone: {
              kind: 'literal',
              value: { $module: 'ref', path: 'bindings.liveZoneId' },
            },
            message: 'The live wall is empty.',
          },
        ],
        effects: [
          {
            kind: 'zone.move-head',
            fromZone: {
              kind: 'literal',
              value: { $module: 'ref', path: 'bindings.liveZoneId' },
            },
            toZone: template('hand:${actorId}'),
          },
          {
            kind: 'event.emit',
            eventType: 'tile.drawn',
            subjects: [actor],
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
            subjects: [actor],
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
      {
        id: 'response.pass',
        parameters: { windowId: 'string' },
        requirements: [responseWindowOpenRequirement('response.pass')],
        effects: [responseSubmit],
      },
      {
        id: 'ron',
        parameters: { windowId: 'string' },
        requirements: [
          responseWindowOpenRequirement('ron'),
          {
            id: 'ron.eligible',
            kind: 'relation-exists',
            source: actor,
            target: windowTile,
            relationType: 'can-win-on',
            message: 'No win-interpretation module marked this tile as a valid ron.',
          },
        ],
        effects: [responseSubmit],
      },
      {
        id: 'pon',
        parameters: { windowId: 'string', tileIds: 'string[]' },
        requirements: [
          responseWindowOpenRequirement('pon'),
          { id: 'pon.tiles-required', kind: 'parameter-present', parameter: 'tileIds', message: 'Pon requires two hand tile ids.' },
          { id: 'pon.two-tiles', kind: 'array-length', value: context('params.tileIds'), length: 2, message: 'Pon requires exactly two hand tiles.' },
          { id: 'pon.distinct', kind: 'entities-distinct', entities: context('params.tileIds'), message: 'Pon tiles must be distinct physical entities.' },
          { id: 'pon.in-hand', kind: 'entities-in-zone', entities: context('params.tileIds'), zone: template('hand:${actorId}'), message: 'Pon tiles must be in the player hand.' },
          { id: 'pon.same-face', kind: 'entities-component-equal', entities: context('params.tileIds'), includeEntity: context('window.sourceEntityId'), componentPath: 'tile.baseFace', message: 'Pon tiles must match the discarded tile.' },
        ],
        effects: [responseSubmit],
      },
      {
        id: 'open-kan',
        parameters: { windowId: 'string', tileIds: 'string[]' },
        requirements: [
          responseWindowOpenRequirement('open-kan'),
          { id: 'open-kan.tiles-required', kind: 'parameter-present', parameter: 'tileIds', message: 'Open kan requires three hand tile ids.' },
          { id: 'open-kan.three-tiles', kind: 'array-length', value: context('params.tileIds'), length: 3, message: 'Open kan requires exactly three hand tiles.' },
          { id: 'open-kan.distinct', kind: 'entities-distinct', entities: context('params.tileIds'), message: 'Kan tiles must be distinct physical entities.' },
          { id: 'open-kan.in-hand', kind: 'entities-in-zone', entities: context('params.tileIds'), zone: template('hand:${actorId}'), message: 'Kan tiles must be in hand.' },
          { id: 'open-kan.same-face', kind: 'entities-component-equal', entities: context('params.tileIds'), includeEntity: context('window.sourceEntityId'), componentPath: 'tile.baseFace', message: 'Open kan tiles must match the discard.' },
        ],
        effects: [responseSubmit],
      },
      {
        id: 'chi',
        parameters: { windowId: 'string', tileIds: 'string[]' },
        requirements: [
          responseWindowOpenRequirement('chi'),
          {
            id: 'chi.next-player',
            kind: 'actor-relative-position',
            sourceActor: context('window.sourceActorId'),
            order: { $module: 'ref', path: 'bindings.playerIds' },
            offset: 1,
            message: 'Only the next player may chi.',
          },
          { id: 'chi.tiles-required', kind: 'parameter-present', parameter: 'tileIds', message: 'Chi requires two hand tile ids.' },
          { id: 'chi.two-tiles', kind: 'array-length', value: context('params.tileIds'), length: 2, message: 'Chi requires exactly two hand tiles.' },
          { id: 'chi.distinct', kind: 'entities-distinct', entities: context('params.tileIds'), message: 'Chi tiles must be distinct.' },
          { id: 'chi.in-hand', kind: 'entities-in-zone', entities: context('params.tileIds'), zone: template('hand:${actorId}'), message: 'Chi tiles must be in hand.' },
          { id: 'chi.same-suit', kind: 'entities-component-equal', entities: context('params.tileIds'), includeEntity: context('window.sourceEntityId'), componentPath: 'tile.suit', message: 'Chi tiles must share a suit.' },
          { id: 'chi.sequence', kind: 'entities-component-consecutive', entities: context('params.tileIds'), includeEntity: context('window.sourceEntityId'), componentPath: 'tile.rank', expectedCount: 3, message: 'Chi tiles must form a three-tile sequence.' },
        ],
        effects: [responseSubmit],
      },
    ],
    bootstrap: [
      {
        procedureId: 'hand.setup',
        ownerId: { $module: 'ref', path: 'bindings.dealerId' },
        tokenId: 'procedure-token:hand.setup',
      },
    ],
    metadata: {
      commonFlow: {
        physicalTileIdentity: true,
        winClaimOnly: true,
        settlementExternal: true,
      },
    },
  },
  artifacts: {
    actions: ['draw', 'discard', 'response.pass', 'ron', 'pon', 'chi', 'open-kan'],
    procedures: ['hand.setup', 'turn'],
    responseWindows: ['riichi.discard-response'],
    eventTypes: ['tile.drawn', 'tile.discarded', 'win.claimed', 'meld.committed'],
  },
  metadata: {
    semanticLayer: 'common-physical-flow',
    excludes: ['hand interpretation', 'yaku', 'fu', 'limit', 'settlement'],
  },
};
