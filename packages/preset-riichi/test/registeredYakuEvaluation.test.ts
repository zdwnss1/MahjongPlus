import { describe, expect, it } from 'vitest';
import {
  compileRegisteredContributionEvaluationModule,
  compileWorld,
  enumeratePartitionInterpretations,
  instantiateRuleModule,
  type PartitionInterpretationItem,
  type WorldSource,
} from '@mahjongplus/world-language';
import type { CoreFormula } from '@mahjongplus/world-calculus';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import {
  RIICHI_HAND_STRUCTURE_PROFILES,
  RIICHI_RESPONSE_FIXED_MELD_CONTEXT_MODULE,
  RIICHI_RESPONSE_INTERPRETATION_MODULE,
  RIICHI_RESPONSE_REGISTERED_EVALUATION_MODULE,
  RIICHI_RESPONSE_WAIT_CLASSIFICATION_MODULE,
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

function responseWorld(hand: TileEntity[], source: TileEntity): WorldSource {
  return {
    schemaVersion: 'mwl/0.9',
    id: 'fixture:registered-yaku-response',
    entities: [
      ...SEATS.map((id) => ({ id, kind: 'player', components: { seat: { seat: id } } })),
      ...hand,
      source,
    ],
    zones: [
      zone('hand:east', 'hand', []),
      zone('hand:south', 'hand', hand.map((entry) => entry.id)),
      zone('hand:west', 'hand', []),
      zone('hand:north', 'hand', []),
      zone('river:east', 'river', [source.id]),
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
            objects: [{ kind: 'entity', entityKind: 'tile', id: { kind: 'literal', value: source.id } }],
            payload: { tileId: source.id },
          },
          {
            kind: 'response-window.open',
            definitionId: 'riichi.discard-response',
            windowId: { kind: 'literal', value: 'window:test' },
            sourceActor: { kind: 'literal', value: 'east' },
            sourceEvent: { kind: 'context', path: 'lastEventId' },
            sourceEntity: { kind: 'literal', value: source.id },
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
            id: 'ron.qualified',
            kind: 'relation-exists',
            source: { kind: 'actor' },
            target: { kind: 'window-source-entity', entityKind: 'tile' },
            relationType: 'can-win-on',
            message: 'The accepted shape has not passed minimum-yaku qualification.',
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

function buildRuntime(hand: TileEntity[], source: TileEntity, evaluationModule = RIICHI_RESPONSE_REGISTERED_EVALUATION_MODULE) {
  let world = responseWorld(hand, source);
  const modules = [
    {
      definition: RIICHI_RESPONSE_INTERPRETATION_MODULE,
      bindings: {
        subjectZones: SEATS.map((subjectId) => ({ subjectId, zoneId: `hand:${subjectId}` })),
        evidenceRelationType: 'has-partition-shape',
      },
    },
    { definition: RIICHI_RESPONSE_FIXED_MELD_CONTEXT_MODULE, bindings: {} },
    { definition: RIICHI_RESPONSE_WAIT_CLASSIFICATION_MODULE, bindings: {} },
    { definition: evaluationModule, bindings: {} },
  ];
  for (const module of modules) world = instantiateRuleModule(world, module).world;
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
  return value.attempt({ attemptId, actorId, actionId, observedRevision: value.currentRevision, parameters });
}

function interpret(
  value: WorldRuntime,
  hand: TileEntity[],
  source: TileEntity,
  profileId = 'structure.standard-four-groups-pair',
) {
  expect(attempt(value, 'open', 'east', 'open-opportunity').outcome).toBe('executed');
  const window = value.openResponseWindows()[0];
  const selectedProfile = RIICHI_HAND_STRUCTURE_PROFILES.find((entry) => entry.id === profileId);
  if (!selectedProfile) throw new Error(`Missing profile ${profileId}.`);
  const proposals = enumeratePartitionInterpretations(
    selectedProfile,
    items([...hand, source]),
    {
      mode: 'response',
      windowId: window.id,
      exposureId: window.sourceEventId,
      sourceEntityId: source.id,
      sourceActorId: 'east',
    },
  );
  expect(proposals.length).toBeGreaterThan(0);
  const receipt = attempt(value, 'interpret', 'south', 'interpretation.submit-response', {
    windowId: window.id,
    proposal: proposals[0].proposal,
  });
  expect(receipt.outcome).toBe('executed');
  const records = value.store.readComponent<{ records: Array<{ id: string }> }>(
    'track:hand-interpretations',
    'interpretations',
  )?.records ?? [];
  return { window, interpretationActionId: records[0].id };
}

function track<T>(value: WorldRuntime, id: string, component: string): T[] {
  return value.store.readComponent<{ records: T[] }>(id, component)?.records ?? [];
}

describe('registered contribution evaluation', () => {
  it('keeps shape acceptance separate from minimum-yaku qualification', () => {
    const hand = numbered('simple', [
      'm2', 'm3',
      'p2', 'p3', 'p4',
      's2', 's3', 's4',
      'm5', 'm5', 'm5',
      'p6', 'p6',
    ]);
    const source = tile('simple:winning', 'm4');
    const { value } = buildRuntime(hand, source);
    const { window, interpretationActionId } = interpret(value, hand, source);

    expect(value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'has-partition-shape')).toHaveLength(1);
    expect(value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'has-hand-shape')).toHaveLength(1);
    expect(value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'can-win-on')).toEqual([]);
    expect(attempt(value, 'early-ron', 'south', 'ron', { windowId: window.id }).outcome).toBe('rejected');

    expect(attempt(value, 'evaluate', 'south', 'evaluation.evaluate-response', {
      interpretationActionId,
    }).outcome).toBe('executed');
    expect(track<{ ruleId: string; dimension: string; value: number }>(
      value,
      'track:response-registered-contributions',
      'contributions',
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'yaku.all-simples', dimension: 'han', value: 1 }),
      expect.objectContaining({ ruleId: 'yaku.all-simples', dimension: 'qualification', value: 1 }),
    ]));
    expect(track<{ total: number; qualifies: boolean }>(
      value,
      'track:response-registered-qualifications',
      'qualifications',
    )[0]).toMatchObject({ total: 1, qualifies: true });

    expect(attempt(value, 'qualify', 'south', 'evaluation.qualify-response', {
      interpretationActionId,
      sourceEntityId: source.id,
    }).outcome).toBe('executed');
    expect(value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'can-win-on')
      .map((entry) => entry.target.id)).toContain(source.id);
    expect(attempt(value, 'ron', 'south', 'ron', { windowId: window.id }).outcome).toBe('executed');
  });

  it('records a valid shape with zero qualification and refuses can-win-on', () => {
    const hand = numbered('no-yaku', [
      'm1', 'm2',
      'p1', 'p2', 'p3',
      's7', 's8', 's9',
      'z1', 'z1', 'z1',
      'm9', 'm9',
    ]);
    const source = tile('no-yaku:winning', 'm3');
    const { value } = buildRuntime(hand, source);
    const { interpretationActionId } = interpret(value, hand, source);
    expect(attempt(value, 'evaluate-no-yaku', 'south', 'evaluation.evaluate-response', {
      interpretationActionId,
    }).outcome).toBe('executed');
    expect(track<{ total: number; qualifies: boolean }>(
      value,
      'track:response-registered-qualifications',
      'qualifications',
    )[0]).toMatchObject({ total: 0, qualifies: false });
    expect(attempt(value, 'qualify-no-yaku', 'south', 'evaluation.qualify-response', {
      interpretationActionId,
      sourceEntityId: source.id,
    }).outcome).toBe('rejected');
    expect(value.store.outgoingRelations({ kind: 'player', id: 'south' }, 'can-win-on')).toEqual([]);
  });

  it('applies signed qualification contributions in declared stage order', () => {
    const always: CoreFormula = { kind: 'boolean', value: true };
    const stagedModule = compileRegisteredContributionEvaluationModule({
      id: 'test.staged-evaluation',
      version: '1.0.0',
      interpretationTrackId: 'track:hand-interpretations',
      fixedContextTrackId: 'track:fixed-meld-interpretation-contexts',
      waitTrackId: 'track:wait-classifications',
      rules: [
        {
          id: 'test.positive',
          predicate: always,
          contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
          qualification: { amount: 1, stage: 'base-yaku' },
        },
        {
          id: 'test.negative',
          predicate: always,
          contributions: [{ dimension: 'han', operation: 'add', value: -1, stage: 'tile-effects' }],
          qualification: { amount: -1, stage: 'tile-effects' },
        },
      ],
      stageOrder: ['base-yaku', 'tile-effects', 'qualification'],
      qualificationStage: 'qualification',
      minimumQualification: 1,
      contributionTrackId: 'track:test-staged-contributions',
      qualificationTrackId: 'track:test-staged-qualifications',
      evaluationActionId: 'evaluation.evaluate-staged',
      qualificationActionId: 'evaluation.qualify-staged',
    });
    const hand = numbered('staged', [
      'm2', 'm3',
      'p2', 'p3', 'p4',
      's2', 's3', 's4',
      'm5', 'm5', 'm5',
      'p6', 'p6',
    ]);
    const source = tile('staged:winning', 'm4');
    const { value } = buildRuntime(hand, source, stagedModule);
    const { interpretationActionId } = interpret(value, hand, source);
    expect(attempt(value, 'evaluate-staged', 'south', 'evaluation.evaluate-staged', {
      interpretationActionId,
    }).outcome).toBe('executed');
    expect(track<{ total: number; qualifies: boolean }>(
      value,
      'track:test-staged-qualifications',
      'qualifications',
    )[0]).toMatchObject({ total: 0, qualifies: false });
    expect(attempt(value, 'qualify-staged', 'south', 'evaluation.qualify-staged', {
      interpretationActionId,
      sourceEntityId: source.id,
    }).outcome).toBe('rejected');
  });
});
