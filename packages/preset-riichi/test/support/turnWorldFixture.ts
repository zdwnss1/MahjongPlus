import type { CoreExpression, FiniteDomainProgram } from '@mahjongplus/world-calculus';
import type { EntityRecord, RelationRecord, ZoneRecord } from '@mahjongplus/world-model';
import type { WorldSource } from '@mahjongplus/world-language';

export interface PhysicalTileSpec {
  id: string;
  face: string;
}

export interface WinEvidenceSpec {
  playerId: string;
  tileId: string;
}

export interface TurnWorldFixtureOptions {
  seats: string[];
  initialOwnerId: string;
  startingPoints?: number;
  hands: Record<string, PhysicalTileSpec[]>;
  wall: PhysicalTileSpec[];
  canWinOn?: WinEvidenceSpec[];
}

export interface TurnWorldFixture {
  source: WorldSource;
  bindings: {
    playerIds: string[];
    turnPairs: Array<{ actorId: string; nextActorId: string }>;
    ledgerId: string;
    liveZoneId: string;
    turnProcedureId: string;
    awaitDrawNodeId: string;
    awaitDiscardNodeId: string;
    completeNodeId: string;
    drawActionId: string;
    discardActionId: string;
    endActionId: string;
    initialDraws: Array<{ subjectId: string; tileId: string | null; exposureId: string | null }>;
    canWinRelationType: string;
  };
}

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });

function tile(spec: PhysicalTileSpec): EntityRecord {
  return {
    id: spec.id,
    kind: 'tile',
    components: {
      tile: {
        baseFace: spec.face,
        suit: spec.face[0],
        rank: Number(spec.face[1]),
        traits: [],
      },
    },
  };
}

function zone(id: string, kind: string, entityIds: string[] = []): ZoneRecord {
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
    metadata: {},
  };
}

export function buildTurnWorldFixture(options: TurnWorldFixtureOptions): TurnWorldFixture {
  const seats = [...options.seats];
  if (seats.length < 2 || new Set(seats).size !== seats.length) throw new Error('Turn fixture seats must be distinct.');
  if (!seats.includes(options.initialOwnerId)) throw new Error('Initial owner must be one of the fixture seats.');
  for (const seat of seats) {
    if (!options.hands[seat]) throw new Error(`Missing hand specification for ${seat}.`);
  }

  const startingPoints = options.startingPoints ?? 25_000;
  const ledgerId = 'ledger:points';
  const liveZoneId = 'wall.live';
  const turnProcedureId = 'turn';
  const awaitDrawNodeId = 'await-draw';
  const awaitDiscardNodeId = 'await-discard';
  const completeNodeId = 'complete';
  const drawActionId = 'draw';
  const discardActionId = 'discard';
  const endActionId = 'end-exhaustive-draw';
  const allTiles = [...seats.flatMap((seat) => options.hands[seat]), ...options.wall];
  if (new Set(allTiles.map((entry) => entry.id)).size !== allTiles.length) throw new Error('Physical tile ids must be unique.');

  const players: EntityRecord[] = seats.map((seat) => ({
    id: seat,
    kind: 'player',
    components: {
      seat: { seat },
      handState: { closed: true },
    },
  }));
  const ledger: EntityRecord = {
    id: ledgerId,
    kind: 'resource-ledger',
    components: {
      ledger: {
        asset: 'points',
        accounts: [
          ...seats.map((id) => ({ id, balance: startingPoints })),
          { id: 'riichi-pot', balance: 0 },
        ],
      },
    },
  };
  const zones: ZoneRecord[] = [
    zone(liveZoneId, 'wall-live', options.wall.map((entry) => entry.id)),
    ...seats.flatMap((seat) => [
      zone(`hand:${seat}`, 'hand', options.hands[seat].map((entry) => entry.id)),
      zone(`river:${seat}`, 'river'),
    ]),
  ];
  const relations: RelationRecord[] = (options.canWinOn ?? []).map((entry, index) => ({
    id: `relation:can-win:${index}`,
    type: 'can-win-on',
    source: { kind: 'player', id: entry.playerId },
    target: { kind: 'tile', id: entry.tileId },
    metadata: {},
  }));
  const wallIndex = zones.findIndex((entry) => entry.id === liveZoneId);
  const wallEmpty: FiniteDomainProgram = {
    id: 'fixture.turn.wall-empty',
    variables: [],
    constraints: [{
      kind: 'compare',
      operator: 'eq',
      left: { kind: 'aggregate', operator: 'count', source: path(variable('world'), 'zones', String(wallIndex), 'entries') },
      right: literal(0),
    }],
    maxSolutions: 1,
    maxSteps: 10_000,
  };

  const source: WorldSource = {
    schemaVersion: 'mwl/0.6',
    id: 'fixture:physical-turn-world',
    entities: [...players, ledger, ...allTiles.map(tile)],
    zones,
    relations,
    actions: [
      {
        id: drawActionId,
        parameters: {},
        requirements: [
          {
            id: 'draw.turn',
            kind: 'procedure-token',
            procedureId: turnProcedureId,
            nodeId: awaitDrawNodeId,
            owner: 'actor',
            message: 'It is not this player draw turn.',
          },
          { id: 'draw.wall', kind: 'zone-not-empty', zone: literal(liveZoneId), message: 'The live wall is empty.' },
        ],
        effects: [
          { kind: 'zone.move-head', fromZone: literal(liveZoneId), toZone: { kind: 'template', template: 'hand:${actorId}' } },
          {
            kind: 'event.emit',
            eventType: 'tile.drawn',
            subjects: [{ kind: 'actor' }],
            objects: [{ kind: 'last-moved-entity', entityKind: 'tile' }],
          },
          { kind: 'procedure.transition', nodeId: awaitDiscardNodeId },
        ],
      },
      {
        id: discardActionId,
        parameters: { tileId: 'string', nextActorId: 'string' },
        requirements: [
          {
            id: 'discard.turn',
            kind: 'procedure-token',
            procedureId: turnProcedureId,
            nodeId: awaitDiscardNodeId,
            owner: 'actor',
            message: 'It is not this player discard turn.',
          },
          { id: 'discard.tile', kind: 'parameter-present', parameter: 'tileId', message: 'A physical tile id is required.' },
          { id: 'discard.next', kind: 'parameter-present', parameter: 'nextActorId', message: 'A next actor id is required.' },
          {
            id: 'discard.in-hand',
            kind: 'entity-in-zone',
            entity: { kind: 'context', path: 'params.tileId' },
            zone: { kind: 'template', template: 'hand:${actorId}' },
            message: 'The tile is not in the player hand.',
          },
        ],
        effects: [
          {
            kind: 'zone.move-entity',
            entity: { kind: 'context', path: 'params.tileId' },
            fromZone: { kind: 'template', template: 'hand:${actorId}' },
            toZone: { kind: 'template', template: 'river:${actorId}' },
          },
          {
            kind: 'event.emit',
            eventType: 'tile.discarded',
            subjects: [{ kind: 'actor' }],
            objects: [{ kind: 'last-moved-entity', entityKind: 'tile' }],
          },
          {
            kind: 'procedure.set-owner',
            tokenId: { kind: 'context', path: 'token.id' },
            owner: { kind: 'context', path: 'params.nextActorId' },
            nodeId: awaitDrawNodeId,
          },
        ],
      },
      {
        id: endActionId,
        parameters: {},
        requirements: [
          {
            id: 'end.turn',
            kind: 'procedure-token',
            procedureId: turnProcedureId,
            nodeId: awaitDrawNodeId,
            owner: 'actor',
            message: 'The hand cannot end from this procedure state.',
          },
          { id: 'end.wall-empty', kind: 'core.constraint', programId: wallEmpty.id, message: 'The live wall is not empty.' },
        ],
        effects: [
          { kind: 'event.emit', eventType: 'hand.ended', subjects: [{ kind: 'actor' }], payload: { reason: 'exhaustive-draw' } },
          { kind: 'procedure.transition', nodeId: completeNodeId },
        ],
      },
    ],
    procedures: [{
      id: turnProcedureId,
      entryNodeId: awaitDiscardNodeId,
      nodes: [{ id: awaitDiscardNodeId }, { id: awaitDrawNodeId }, { id: completeNodeId }],
    }],
    responseWindows: [],
    corePrograms: { constraints: [wallEmpty], reducers: [], rewrites: [] },
    bootstrap: [{ procedureId: turnProcedureId, ownerId: options.initialOwnerId, tokenId: 'procedure-token:turn' }],
    metadata: { preset: 'fixture/physical-turn-world' },
  };

  return {
    source,
    bindings: {
      playerIds: seats,
      turnPairs: seats.map((actorId, index) => ({ actorId, nextActorId: seats[(index + 1) % seats.length] })),
      ledgerId,
      liveZoneId,
      turnProcedureId,
      awaitDrawNodeId,
      awaitDiscardNodeId,
      completeNodeId,
      drawActionId,
      discardActionId,
      endActionId,
      initialDraws: seats.map((subjectId) => ({ subjectId, tileId: null, exposureId: null })),
      canWinRelationType: 'can-win-on',
    },
  };
}
