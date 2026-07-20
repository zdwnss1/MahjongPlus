import { describe, expect, it } from 'vitest';
import {
  compileWorld,
  instantiateRuleModule,
  type RuleModuleDefinition,
  type WorldSource,
} from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import {
  IX3_FIRST_TEN_DECLARATION_MODULE,
  IX3_FIRST_TEN_DIRECT_EVALUATION_MODULE,
  IX3_FIRST_TEN_IMPLEMENTATION_STATUS,
  IX3_FIRST_TEN_RESPONSE_EVALUATION_MODULE,
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

function emptyWorld(id: string): WorldSource {
  return {
    schemaVersion: 'mwl/0.9',
    id,
    entities: [],
    zones: [],
    relations: [],
    actions: [],
    procedures: [],
    responseWindows: [],
    corePrograms: { constraints: [], reducers: [], rewrites: [] },
    bootstrap: [],
    initialEvents: [],
  };
}

function attempt(
  runtime: WorldRuntime,
  attemptId: string,
  actorId: string,
  actionId: string,
  parameters: Record<string, unknown> = {},
) {
  return runtime.attempt({
    attemptId,
    actorId,
    actionId,
    observedRevision: runtime.currentRevision,
    parameters,
  });
}

function contributions(runtime: WorldRuntime, trackId: string) {
  return runtime.store.readComponent<{ records: Array<{
    ruleId: string;
    dimension: string;
    value: number | string;
  }> }>(trackId, 'contributions')?.records ?? [];
}

function qualifications(runtime: WorldRuntime, trackId: string) {
  return runtime.store.readComponent<{ records: Array<{
    total: number;
    qualifies: boolean;
  }> }>(trackId, 'qualifications')?.records ?? [];
}

function evaluationWorld(
  mode: 'direct' | 'response',
  faces: string[],
  sourceIndex: number,
  helperActions: WorldSource['actions'] = [],
): {
  world: WorldSource;
  source: TileEntity;
  interpretationTrackId: string;
  fixedTrackId: string;
  waitTrackId: string;
  interpretationComponent: string;
  fixedComponent: string;
  waitComponent: string;
} {
  const tiles = faces.map((face, index) => tile(`tile:${index}`, face));
  const source = tiles[sourceIndex];
  const direct = mode === 'direct';
  const interpretationTrackId = direct ? 'track:direct-hand-interpretations' : 'track:hand-interpretations';
  const fixedTrackId = direct ? 'track:direct-fixed-meld-contexts' : 'track:fixed-meld-interpretation-contexts';
  const waitTrackId = direct ? 'track:direct-wait-classifications' : 'track:wait-classifications';
  const world = emptyWorld(`fixture:ix3:${mode}`);
  world.entities = [
    { id: 'south', kind: 'player', components: {} },
    { id: 'east', kind: 'player', components: {} },
    ...tiles,
    {
      id: interpretationTrackId,
      kind: 'fact-track',
      components: {
        interpretations: {
          records: [{
            id: 'interpretation:1',
            actorId: 'south',
            profileId: 'fixture-profile',
            structureId: 'fixture-structure',
            items: tiles.map((entry) => ({ id: entry.id, attributes: structuredClone(entry) })),
            source: {
              mode,
              exposureId: 'source:event:pending',
              sourceEntityId: source.id,
              sourceActorId: direct ? 'south' : 'east',
            },
          }],
        },
      },
    },
    {
      id: fixedTrackId,
      kind: 'fact-track',
      components: {
        fixedGroupContexts: {
          records: [{
            interpretationActionId: 'interpretation:1',
            actorId: 'south',
            closed: true,
            fixedGroups: [],
          }],
        },
      },
    },
    {
      id: waitTrackId,
      kind: 'fact-track',
      components: {
        waitClassifications: {
          records: [{
            interpretationActionId: 'interpretation:1',
            actorId: 'south',
            classification: 'single',
          }],
        },
      },
    },
  ];
  world.relations = [{
    id: 'relation:shape',
    type: 'has-hand-shape',
    source: { kind: 'player', id: 'south' },
    target: { kind: 'tile', id: source.id },
    metadata: {},
  }];
  world.actions = helperActions;
  return {
    world,
    source,
    interpretationTrackId,
    fixedTrackId,
    waitTrackId,
    interpretationComponent: 'interpretations',
    fixedComponent: 'fixedGroupContexts',
    waitComponent: 'waitClassifications',
  };
}

function buildEvaluationRuntime(
  mode: 'direct' | 'response',
  faces: string[],
  sourceIndex: number,
  parameters: {
    specialDoraFaces?: string[];
    activeDoraFaces?: string[];
    noCallCommitmentActorIds?: string[];
  } = {},
  helperActions: WorldSource['actions'] = [],
) {
  const fixture = evaluationWorld(mode, faces, sourceIndex, helperActions);
  const definition = mode === 'direct'
    ? IX3_FIRST_TEN_DIRECT_EVALUATION_MODULE
    : IX3_FIRST_TEN_RESPONSE_EVALUATION_MODULE;
  const instantiated = instantiateRuleModule(fixture.world, {
    definition,
    parameters: {
      specialDoraFaces: parameters.specialDoraFaces ?? [],
      activeDoraFaces: parameters.activeDoraFaces ?? [],
      noCallCommitmentActorIds: parameters.noCallCommitmentActorIds ?? [],
    },
  });
  return {
    ...fixture,
    runtime: new WorldRuntime(compileWorld(instantiated.world)),
    contributionTrackId: mode === 'direct'
      ? 'track:ix3-first-ten-direct-contributions'
      : 'track:ix3-first-ten-response-contributions',
    qualificationTrackId: mode === 'direct'
      ? 'track:ix3-first-ten-direct-qualifications'
      : 'track:ix3-first-ten-response-qualifications',
    evaluationActionId: mode === 'direct'
      ? 'evaluation.evaluate-ix3-first-ten-direct'
      : 'evaluation.evaluate-ix3-first-ten-response',
  };
}

function setExposure(runtime: WorldRuntime, trackId: string, eventId: string): void {
  const value = runtime.store.readComponent<{ records: Array<Record<string, unknown>> }>(trackId, 'interpretations');
  if (!value) throw new Error(`Missing interpretation track ${trackId}.`);
  const records = structuredClone(value.records);
  const source = records[0].source as Record<string, unknown>;
  source.exposureId = eventId;
  runtime.store.setComponent(trackId, 'interpretations', { records });
}

function findEvent(runtime: WorldRuntime, type: string, actorId?: string) {
  const event = runtime.journal.all().findLast((entry) => entry.type === type && (!actorId || entry.actorId === actorId));
  if (!event) throw new Error(`Missing event ${type}.`);
  return event;
}

function declarationWorld(): WorldSource {
  const world = emptyWorld('fixture:ix3:declarations');
  world.entities = [
    { id: 'east', kind: 'player', components: { riichi: { eligible: true } } },
    { id: 'wait:east:single', kind: 'wait-evidence', components: { wait: { form: 'single' } } },
    {
      id: 'ledger:points',
      kind: 'resource-ledger',
      components: {
        ledger: {
          accounts: [
            { id: 'east', balance: 25_000 },
            { id: 'riichi-pot', balance: 0 },
          ],
        },
      },
    },
  ];
  world.relations = [{
    id: 'relation:east-single-wait',
    type: 'has-single-wait',
    source: { kind: 'player', id: 'east' },
    target: { kind: 'wait-evidence', id: 'wait:east:single' },
    metadata: {},
  }];
  world.actions = [
    { id: 'ron', parameters: {}, requirements: [], effects: [] },
    { id: 'declare-riichi', parameters: {}, requirements: [], effects: [] },
    {
      id: 'commit-pon',
      parameters: {},
      requirements: [],
      effects: [{
        kind: 'event.emit',
        eventType: 'meld.committed',
        subjects: [{ kind: 'actor' }],
        payload: { callType: 'pon' },
      }],
    },
  ];
  world.procedures = [{
    id: 'turn',
    entryNodeId: 'await-discard',
    nodes: [{ id: 'await-discard' }],
  }];
  world.bootstrap = [{ procedureId: 'turn', ownerId: 'east', tokenId: 'turn-token' }];
  return world;
}

function buildDeclarationRuntime() {
  const world = instantiateRuleModule(declarationWorld(), {
    definition: IX3_FIRST_TEN_DECLARATION_MODULE,
    bindings: {
      ledgerId: 'ledger:points',
      singleWaitRelationType: 'has-single-wait',
    },
  }).world;
  const runtime = new WorldRuntime(compileWorld(world));
  runtime.start();
  return runtime;
}

function factRecords(runtime: WorldRuntime, id: string) {
  return runtime.store.readComponent<{ records: Array<Record<string, unknown>> }>(id, 'factTrack')?.records ?? [];
}

function evaluate(runtimeData: ReturnType<typeof buildEvaluationRuntime>) {
  return attempt(
    runtimeData.runtime,
    `evaluate:${runtimeData.runtime.currentRevision}`,
    'south',
    runtimeData.evaluationActionId,
    { interpretationActionId: 'interpretation:1' },
  );
}

describe('ix3 local yaku entries 1–10', () => {
  it('keeps the source-page order explicit', () => {
    expect(IX3_FIRST_TEN_IMPLEMENTATION_STATUS.map((entry) => entry.order)).toEqual([1,2,3,4,5,6,7,8,9,10]);
  });

  it('counts contextual dora dynamically without making dora alone a qualifying yaku', () => {
    const data = buildEvaluationRuntime(
      'direct',
      ['m1', 'm1', 'm2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'm5', 'm5', 'm5'],
      2,
      { specialDoraFaces: ['m1'] },
    );
    expect(evaluate(data).outcome).toBe('executed');
    expect(contributions(data.runtime, data.contributionTrackId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'local.special-dora', dimension: 'han', value: 2 }),
    ]));
    expect(qualifications(data.runtime, data.qualificationTrackId)[0]).toMatchObject({ total: 0, qualifies: false });
  });

  it('qualifies dora-ho only when the physical winning source is a configured dora face', () => {
    const data = buildEvaluationRuntime(
      'response',
      ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'm5', 'm5', 'm5', 'p6', 'p6'],
      2,
      { activeDoraFaces: ['m4'] },
    );
    expect(evaluate(data).outcome).toBe('executed');
    expect(contributions(data.runtime, data.contributionTrackId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'local.dora-ho', dimension: 'han', value: 1 }),
    ]));
    expect(qualifications(data.runtime, data.qualificationTrackId)[0]).toMatchObject({ total: 1, qualifies: true });
  });

  it('implements pon-riichi, hochi, tsumo-sen and bunbun as independent declaration facts', () => {
    const pon = buildDeclarationRuntime();
    expect(attempt(pon, 'pon', 'east', 'commit-pon').outcome).toBe('executed');
    expect(attempt(pon, 'pon-riichi', 'east', 'declare-pon-riichi').outcome).toBe('executed');
    expect(factRecords(pon, 'track:ix3-declaration-privileges')[0]).toMatchObject({
      uraDora: false,
      ippatsu: false,
      exclusiveGroup: 'riichi-declaration',
    });

    const hochi = buildDeclarationRuntime();
    expect(attempt(hochi, 'hochi', 'east', 'declare-hochi', {
      waitEvidenceId: 'wait:east:single',
      waitForm: 'single',
    }).outcome).toBe('executed');
    expect(hochi.store.readComponent<{ accounts: Array<{ id: string; balance: number }> }>('ledger:points', 'ledger')?.accounts)
      .toEqual([{ id: 'east', balance: 22_000 }, { id: 'riichi-pot', balance: 3_000 }]);
    expect(factRecords(hochi, 'track:ix3-local-declarations')).toEqual(expect.arrayContaining([
      expect.objectContaining({ declarationType: 'hochi-wait', waitForm: 'single' }),
    ]));

    const tsumoSen = buildDeclarationRuntime();
    expect(attempt(tsumoSen, 'tsumo-sen', 'east', 'declare-tsumo-sen').outcome).toBe('executed');
    expect(attempt(tsumoSen, 'blocked-ron', 'east', 'ron').outcome).toBe('rejected');
    expect(factRecords(tsumoSen, 'track:ix3-win-source-policies')[0]).toMatchObject({
      allowedModes: ['direct'],
      state: 'active',
    });

    const bunbun = buildDeclarationRuntime();
    expect(attempt(bunbun, 'bunbun', 'east', 'declare-bunbun-riichi').outcome).toBe('executed');
    expect(factRecords(bunbun, 'track:ix3-visibility-policies')[0]).toMatchObject({
      audience: 'all',
      scope: 'hand',
      state: 'active',
    });
  });

  it('recognizes tsubame-gaeshi from the riichi declaration discard correlation', () => {
    const helperActions: WorldSource['actions'] = [{
      id: 'declare-and-discard',
      parameters: {},
      requirements: [],
      effects: [
        {
          kind: 'event.emit',
          eventType: 'declaration.published',
          subjects: [{ kind: 'actor' }],
          payload: { declarationType: 'riichi' },
        },
        {
          kind: 'event.emit',
          eventType: 'tile.discarded',
          subjects: [{ kind: 'actor' }],
          objects: [{ kind: 'entity', entityKind: 'tile', id: { kind: 'literal', value: 'tile:2' } }],
          payload: { tileId: 'tile:2' },
        },
      ],
    }];
    const data = buildEvaluationRuntime(
      'response',
      ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'm5', 'm5', 'm5', 'p6', 'p6'],
      2,
      {},
      helperActions,
    );
    expect(attempt(data.runtime, 'declare-and-discard', 'east', 'declare-and-discard').outcome).toBe('executed');
    setExposure(data.runtime, data.interpretationTrackId, findEvent(data.runtime, 'tile.discarded', 'east').id);
    expect(evaluate(data).outcome).toBe('executed');
    expect(contributions(data.runtime, data.contributionTrackId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'local.tsubame-gaeshi', value: 1 }),
    ]));
  });

  it('recognizes kakikomi and ordered pon-chi-kan-ron from durable event history', () => {
    const directActions: WorldSource['actions'] = [
      {
        id: 'declare-self', parameters: {}, requirements: [],
        effects: [{ kind: 'event.emit', eventType: 'declaration.published', subjects: [{ kind: 'actor' }], payload: { declarationType: 'riichi' } }],
      },
      {
        id: 'draw-white', parameters: {}, requirements: [],
        effects: [{ kind: 'event.emit', eventType: 'tile.drawn', subjects: [{ kind: 'actor' }], objects: [{ kind: 'entity', entityKind: 'tile', id: { kind: 'literal', value: 'tile:13' } }] }],
      },
    ];
    const kakikomi = buildEvaluationRuntime(
      'direct',
      ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'm5', 'm5', 'm5', 'p6', 'z5'],
      13,
      {},
      directActions,
    );
    expect(attempt(kakikomi.runtime, 'declare-self', 'south', 'declare-self').outcome).toBe('executed');
    expect(attempt(kakikomi.runtime, 'draw-white', 'south', 'draw-white').outcome).toBe('executed');
    setExposure(kakikomi.runtime, kakikomi.interpretationTrackId, findEvent(kakikomi.runtime, 'tile.drawn', 'south').id);
    expect(evaluate(kakikomi).outcome).toBe('executed');
    expect(contributions(kakikomi.runtime, kakikomi.contributionTrackId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'local.kakikomi', value: 1 }),
    ]));

    const sequenceActions: WorldSource['actions'] = [
      ...(['pon', 'chi', 'open-kan'] as const).map((callType) => ({
        id: `emit-${callType}`,
        parameters: {},
        requirements: [],
        effects: [{ kind: 'event.emit' as const, eventType: 'meld.committed', subjects: [{ kind: 'actor' as const }], payload: { callType } }],
      })),
      {
        id: 'emit-discard', parameters: {}, requirements: [],
        effects: [{ kind: 'event.emit', eventType: 'tile.discarded', subjects: [{ kind: 'actor' }], objects: [{ kind: 'entity', entityKind: 'tile', id: { kind: 'literal', value: 'tile:2' } }] }],
      },
    ];
    const sequence = buildEvaluationRuntime(
      'response',
      ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'm5', 'm5', 'm5', 'p6', 'p6'],
      2,
      {},
      sequenceActions,
    );
    for (const action of ['emit-pon', 'emit-chi', 'emit-open-kan']) {
      expect(attempt(sequence.runtime, action, 'south', action).outcome).toBe('executed');
    }
    expect(attempt(sequence.runtime, 'emit-discard', 'east', 'emit-discard').outcome).toBe('executed');
    setExposure(sequence.runtime, sequence.interpretationTrackId, findEvent(sequence.runtime, 'tile.discarded', 'east').id);
    expect(evaluate(sequence).outcome).toBe('executed');
    expect(contributions(sequence.runtime, sequence.contributionTrackId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'local.pon-chi-kan-ron', value: 1 }),
    ]));
  });

  it('uses an explicit pre-hand commitment for no-chi/no-pon and invalidates it after a call', () => {
    const noCall = buildEvaluationRuntime(
      'direct',
      ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'm5', 'm5', 'm5', 'p6', 'p6'],
      2,
      { noCallCommitmentActorIds: ['south'] },
    );
    expect(evaluate(noCall).outcome).toBe('executed');
    expect(contributions(noCall.runtime, noCall.contributionTrackId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'local.no-chi-no-pon', value: 1 }),
    ]));

    const withCall = buildEvaluationRuntime(
      'direct',
      ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'm5', 'm5', 'm5', 'p6', 'p6'],
      2,
      { noCallCommitmentActorIds: ['south'] },
      [{
        id: 'emit-call', parameters: {}, requirements: [],
        effects: [{ kind: 'event.emit', eventType: 'meld.committed', subjects: [{ kind: 'actor' }], payload: { callType: 'pon' } }],
      }],
    );
    expect(attempt(withCall.runtime, 'emit-call', 'south', 'emit-call').outcome).toBe('executed');
    expect(evaluate(withCall).outcome).toBe('executed');
    expect(contributions(withCall.runtime, withCall.contributionTrackId)
      .some((entry) => entry.ruleId === 'local.no-chi-no-pon')).toBe(false);
  });
});
