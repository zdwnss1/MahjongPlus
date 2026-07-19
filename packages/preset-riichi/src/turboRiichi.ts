import type { DataSchema, WorldSource } from '@mahjongplus/world-language';
import { createTurboRiichiModel } from './turboRiichiModel.js';
import { createTurboRiichiPrograms } from './turboRiichiPrograms.js';
import {
  TURBO_PLAYERS,
  type TurboRiichiFixture,
  type TurboRiichiOptions,
} from './turboRiichiTypes.js';

export * from './turboRiichiTypes.js';

export function createTurboRiichiFixture(options: TurboRiichiOptions = {}): TurboRiichiFixture {
  const model = createTurboRiichiModel(options);
  const programs = createTurboRiichiPrograms(model);
  const { policy, ids } = model;
  const context = (path: string) => ({ kind: 'context', path } as const);
  const template = (value: string) => ({ kind: 'template', template: value } as const);
  const literal = (value: unknown) => ({ kind: 'literal', value } as const);

  const declarationInputSchema: DataSchema = {
    type: 'object',
    properties: {
      tileIds: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 3,
        uniqueItems: true,
      },
    },
    required: ['tileIds'],
    additionalProperties: false,
  };

  const source: WorldSource = {
    schemaVersion: 'mwl/0.5',
    id: `turbo-riichi-fixture:${policy.declarerId}:${policy.maxWinsPerPlayer ?? 'unlimited'}`,
    entities: model.entities,
    zones: model.zones,
    relations: model.relations,
    procedures: [{
      id: 'turn',
      entryNodeId: 'await-discard',
      nodes: [
        { id: 'await-discard' },
        { id: 'await-draw' },
        { id: 'await-response' },
        { id: 'complete' },
      ],
    }],
    responseWindows: [{
      id: 'turbo-riichi.win-opportunity',
      allowedActionIds: ['turbo-riichi.win', 'response.pass'],
      participantOrder: [...TURBO_PLAYERS],
      excludeSourceActor: true,
      tiers: [{ actionIds: ['turbo-riichi.win'], selection: 'all', maxSelections: 3 }],
      noSelectionEffects: [{
        kind: 'procedure.transition',
        tokenId: context('window.parentTokenId'),
        nodeId: 'await-draw',
      }],
      selectionEffects: {
        'turbo-riichi.win': [
          { kind: 'core.rewrite', programId: programs.rewrites.ron.id },
          {
            kind: 'event.emit',
            eventType: 'win.recorded',
            subjects: [{ kind: 'actor' }],
            objects: [{ kind: 'window-source-entity', entityKind: 'tile' }],
            payload: { mode: 'ron', continuingHand: true },
          },
          {
            kind: 'procedure.transition',
            tokenId: context('window.parentTokenId'),
            nodeId: 'await-draw',
          },
        ],
      },
    }],
    actions: [
      {
        id: 'declare-turbo-riichi',
        parameters: { tileIds: 'string[]' },
        requirements: [
          {
            id: 'turbo.declare-turn',
            kind: 'procedure-token',
            procedureId: 'turn',
            nodeId: 'await-discard',
            owner: 'actor',
            message: 'Turbo riichi must be declared on the player turn.',
          },
          {
            id: 'turbo.triplet-present',
            kind: 'parameter-present',
            parameter: 'tileIds',
            message: 'Three physical tile ids are required.',
          },
          {
            id: 'turbo.triplet-length',
            kind: 'array-length',
            value: context('params.tileIds'),
            length: 3,
            message: 'Exactly three tiles must be exposed.',
          },
          {
            id: 'turbo.triplet-distinct',
            kind: 'entities-distinct',
            entities: context('params.tileIds'),
            message: 'The exposed tiles must be distinct.',
          },
          {
            id: 'turbo.triplet-in-hand',
            kind: 'entities-in-zone',
            entities: context('params.tileIds'),
            zone: template('hand:${actorId}'),
            message: 'The exposed tiles must remain in the declarer hand.',
          },
          {
            id: 'turbo.declaration-eligible',
            kind: 'core.constraint',
            programId: programs.constraints.declaration.id,
            message: 'The selected tiles do not form an eligible concealed seven triplet.',
          },
        ],
        effects: [
          { kind: 'core.rewrite', programId: programs.rewrites.declaration.id },
          {
            kind: 'event.emit',
            eventType: 'resource.transferred',
            subjects: [{ kind: 'actor' }],
            payload: { asset: 'points', amount: policy.stake, toAccountId: 'riichi-pot' },
          },
          {
            kind: 'event.emit',
            eventType: 'declaration.published',
            subjects: [{ kind: 'actor' }],
            payload: { declarationType: 'turbo-riichi', audience: 'all' },
          },
          {
            kind: 'event.emit',
            eventType: 'score-contribution.granted',
            subjects: [{ kind: 'actor' }],
            payload: { dimension: 'han', amount: policy.riichiHan },
          },
          {
            kind: 'event.emit',
            eventType: 'discard-policy.activated',
            subjects: TURBO_PLAYERS.map((id) => ({
              kind: 'entity' as const,
              entityKind: 'player',
              id: literal(id),
            })),
            payload: { allowedSource: 'latest-draw', targetScope: 'all-players' },
          },
          {
            kind: 'event.emit',
            eventType: 'furiten-policy.activated',
            subjects: [{ kind: 'actor' }],
            payload: { furitenClass: 'riichi-pass' },
          },
          {
            kind: 'event.emit',
            eventType: 'visibility.updated',
            subjects: [{ kind: 'actor' }],
            payload: { audience: 'all', reason: 'turbo-riichi-proof' },
          },
        ],
      },
      {
        id: 'draw',
        parameters: {},
        requirements: [
          {
            id: 'draw.turn',
            kind: 'procedure-token',
            procedureId: 'turn',
            nodeId: 'await-draw',
            owner: 'actor',
            message: 'It is not this player draw turn.',
          },
          {
            id: 'draw.wall',
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
          },
          { kind: 'procedure.transition', nodeId: 'await-discard' },
        ],
      },
      {
        id: 'discard',
        parameters: { tileId: 'string', nextActorId: 'string' },
        requirements: [
          {
            id: 'discard.turn',
            kind: 'procedure-token',
            procedureId: 'turn',
            nodeId: 'await-discard',
            owner: 'actor',
            message: 'It is not this player discard turn.',
          },
          { id: 'discard.tile', kind: 'parameter-present', parameter: 'tileId', message: 'A physical tile id is required.' },
          { id: 'discard.next', kind: 'parameter-present', parameter: 'nextActorId', message: 'The server-derived next actor is required.' },
          {
            id: 'discard.in-hand',
            kind: 'entity-in-zone',
            entity: context('params.tileId'),
            zone: template('hand:${actorId}'),
            message: 'The tile is not in the player hand.',
          },
          {
            id: 'discard.policy',
            kind: 'core.constraint',
            programId: programs.constraints.discard.id,
            message: 'An active discard policy requires the latest drawn tile.',
          },
        ],
        effects: [
          {
            kind: 'zone.move-entity',
            entity: context('params.tileId'),
            fromZone: template('hand:${actorId}'),
            toZone: template('river:${actorId}'),
          },
          {
            kind: 'event.emit',
            eventType: 'tile.discarded',
            subjects: [{ kind: 'actor' }],
            objects: [{ kind: 'last-moved-entity', entityKind: 'tile' }],
          },
          {
            kind: 'procedure.set-owner',
            tokenId: context('token.id'),
            owner: context('params.nextActorId'),
            nodeId: 'await-response',
          },
          {
            kind: 'response-window.open',
            definitionId: 'turbo-riichi.win-opportunity',
            windowId: template('turbo-response:${lastEventId}'),
            sourceActor: context('actorId'),
            sourceEvent: context('lastEventId'),
            sourceEntity: context('params.tileId'),
            parentTokenId: context('token.id'),
          },
        ],
      },
      {
        id: 'turbo-riichi.win',
        parameters: { windowId: 'string' },
        requirements: [
          {
            id: 'turbo.win-window',
            kind: 'response-window-open',
            windowId: context('params.windowId'),
            message: 'The win opportunity is not open.',
          },
          {
            id: 'turbo.can-win',
            kind: 'relation-exists',
            source: { kind: 'actor' },
            target: { kind: 'window-source-entity', entityKind: 'tile' },
            relationType: 'can-win-on',
            message: 'This player cannot win on the exposed tile.',
          },
          {
            id: 'turbo.win-limit',
            kind: 'core.constraint',
            programId: programs.constraints.ronLimit.id,
            message: 'This player has reached the turbo win limit.',
          },
        ],
        effects: [{ kind: 'response-window.submit', windowId: context('params.windowId') }],
      },
      {
        id: 'response.pass',
        parameters: { windowId: 'string' },
        requirements: [{
          id: 'turbo.pass-window',
          kind: 'response-window-open',
          windowId: context('params.windowId'),
          message: 'The win opportunity is not open.',
        }],
        effects: [{ kind: 'response-window.submit', windowId: context('params.windowId') }],
      },
      {
        id: 'turbo-riichi.self-win',
        parameters: {},
        requirements: [
          {
            id: 'turbo.self-turn',
            kind: 'procedure-token',
            procedureId: 'turn',
            nodeId: 'await-discard',
            owner: 'actor',
            message: 'Self win is only available after drawing.',
          },
          {
            id: 'turbo.self-eligible',
            kind: 'core.constraint',
            programId: programs.constraints.selfWin.id,
            message: 'This draw is not an available continuing win.',
          },
        ],
        effects: [
          { kind: 'core.rewrite', programId: programs.rewrites.selfWin.id },
          {
            kind: 'event.emit',
            eventType: 'win.recorded',
            subjects: [{ kind: 'actor' }],
            payload: { mode: 'tsumo', continuingHand: true },
          },
        ],
      },
      {
        id: 'end-exhaustive-draw',
        parameters: {},
        requirements: [
          {
            id: 'end.turn',
            kind: 'procedure-token',
            procedureId: 'turn',
            nodeId: 'await-draw',
            owner: 'actor',
            message: 'The hand cannot end from this procedure state.',
          },
          {
            id: 'end.wall-empty',
            kind: 'core.constraint',
            programId: programs.constraints.wallEmpty.id,
            message: 'The live wall is not empty.',
          },
        ],
        effects: [
          {
            kind: 'event.emit',
            eventType: 'hand.ended',
            subjects: [{ kind: 'actor' }],
            payload: { reason: 'exhaustive-draw' },
          },
          { kind: 'procedure.transition', nodeId: 'complete' },
        ],
      },
    ],
    corePrograms: {
      constraints: Object.values(programs.constraints),
      reducers: Object.values(programs.reducers),
      rewrites: Object.values(programs.rewrites),
    },
    bootstrap: [{ procedureId: 'turn', ownerId: policy.declarerId, tokenId: 'procedure-token:turn' }],
    metadata: {
      preset: 'fixture/turbo-riichi',
      policy,
      declarationInputSchema,
      languageNotes: {
        exposedTriplet: 'Visibility changes without moving or opening the tile entities.',
        forcedDiscard: 'Subject-scoped discard policies are consumed by the ordinary discard constraint.',
        continuingWins: 'Win records do not transition to a terminal hand state.',
        simultaneousWins: 'The existing all-selection response tier records every accepted claim.',
        winLimit: 'A per-subject count constraint over generic win records.',
      },
    },
  };

  return { source, policy, declarationInputSchema, ids };
}
