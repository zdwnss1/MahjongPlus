import { describe, expect, it } from 'vitest';
import {
  MAHJONG_LANGUAGE_MCP_CATALOG,
  MAHJONG_LANGUAGE_SYSTEM_PROMPT,
  composeWorldModules,
  instantiateRuleModule,
  validateRuleModuleDefinition,
  type RuleModuleDefinition,
  type WorldSource,
} from '../src/index.js';

const BASE_WORLD: WorldSource = {
  schemaVersion: 'mwl/0.6',
  id: 'fixture:rule-module-base',
  entities: [{ id: 'player:east', kind: 'player', components: { score: { value: 25000 } } }],
  zones: [],
  relations: [],
  actions: [{
    id: 'base.action',
    parameters: {},
    requirements: [],
    effects: [{ kind: 'event.emit', eventType: 'base.action', payload: {} }],
  }],
  procedures: [],
  responseWindows: [],
  corePrograms: { constraints: [], reducers: [], rewrites: [] },
  bootstrap: [],
};

const MODULE: RuleModuleDefinition = {
  id: 'fixture.module',
  version: '1.0.0',
  title: 'Fixture module',
  parameters: {
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', integer: true, minimum: 1 },
        trackId: { type: 'string', minLength: 1 },
      },
      required: ['amount', 'trackId'],
      additionalProperties: false,
    },
    defaults: { amount: 2, trackId: 'track:fixture' },
  },
  requiredBindings: ['actorId'],
  additions: {
    entities: [{
      id: { $module: 'ref', path: 'parameters.trackId' },
      kind: 'fact-track',
      components: { facts: { records: [] } },
    }],
    corePrograms: {
      constraints: [{
        id: 'fixture.module.constraint',
        variables: [],
        constraints: [{
          kind: 'compare',
          operator: 'eq',
          left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.amount' } },
          right: { kind: 'literal', value: 2 },
        }],
        maxSolutions: 1,
        maxSteps: 100,
      }],
      rewrites: [{
        id: 'fixture.module.rewrite',
        operations: [{
          kind: 'set',
          path: [
            'world',
            'entities',
            { $module: 'entity-index', id: { $module: 'ref', path: 'parameters.trackId' } },
            'components',
            'facts',
            'records',
          ],
          value: {
            kind: 'list',
            items: [{
              kind: 'record',
              fields: {
                actorId: { kind: 'literal', value: { $module: 'ref', path: 'bindings.actorId' } },
                amount: { kind: 'literal', value: { $module: 'ref', path: 'parameters.amount' } },
              },
            }],
          },
        }],
      }],
    },
    metadata: {
      fixtureLabel: { $module: 'template', value: '${module.id}@${module.version}' },
    },
  },
  patches: [{
    kind: 'action.effects',
    actionId: 'base.action',
    placement: 'append',
    values: [{ kind: 'core.rewrite', programId: 'fixture.module.rewrite' }],
  }],
  artifacts: {
    award: {
      amount: { $module: 'ref', path: 'parameters.amount' },
      actorId: { $module: 'ref', path: 'bindings.actorId' },
    },
  },
};

describe('declarative rule module language', () => {
  it('instantiates JSON module data with parameters, bindings, indices, patches and artifacts', () => {
    const result = instantiateRuleModule(BASE_WORLD, {
      definition: MODULE,
      bindings: { actorId: 'player:east' },
    });
    expect(result.world.entities.some((entity) => entity.id === 'track:fixture')).toBe(true);
    expect(result.world.actions[0].effects.at(-1)).toEqual({ kind: 'core.rewrite', programId: 'fixture.module.rewrite' });
    expect(result.world.corePrograms?.rewrites?.[0].operations[0].path[2]).toBe('1');
    expect(result.world.metadata?.fixtureLabel).toBe('fixture.module@1.0.0');
    expect(result.artifacts).toEqual({ award: { amount: 2, actorId: 'player:east' } });
    expect(result.manifest.artifactKeys).toEqual(['award']);
  });

  it('rejects invalid parameters, missing bindings and host functions', () => {
    expect(() => instantiateRuleModule(BASE_WORLD, {
      definition: MODULE,
      parameters: { amount: 0, trackId: 'track:x' },
      bindings: { actorId: 'player:east' },
    })).toThrow(/minimum/);
    expect(() => instantiateRuleModule(BASE_WORLD, { definition: MODULE })).toThrow(/bindings.actorId/);
    expect(validateRuleModuleDefinition({
      ...MODULE,
      metadata: { callback: () => true },
    } as unknown as RuleModuleDefinition)[0]).toMatch(/not JSON serializable/);
  });

  it('survives JSON round-trip and composes modules in declared order', () => {
    const roundTrip = JSON.parse(JSON.stringify(MODULE)) as RuleModuleDefinition;
    expect(validateRuleModuleDefinition(roundTrip)).toEqual([]);
    const second: RuleModuleDefinition = {
      id: 'fixture.second',
      version: '1',
      requiredBindings: ['actorId'],
      additions: { entities: [{ id: 'entity:second', kind: 'marker', components: {} }] },
      artifacts: { priorTrack: { $module: 'ref', path: 'bindings.priorTrack' } },
    };
    const result = composeWorldModules(BASE_WORLD, [
      { definition: roundTrip, bindings: { actorId: 'player:east' } },
      { definition: second, bindings: { actorId: 'player:east', priorTrack: 'track:fixture' } },
    ]);
    expect(result.world.entities.map((entity) => entity.id)).toEqual(['player:east', 'track:fixture', 'entity:second']);
    expect(result.artifacts['fixture.second']).toEqual({ priorTrack: 'track:fixture' });
  });

  it('publishes an MCP contract that forces LLMs through validation and compilation', () => {
    const names = MAHJONG_LANGUAGE_MCP_CATALOG.tools.map((tool) => tool.name);
    expect(names).toContain('mahjong.module.validate');
    expect(names).toContain('mahjong.module.instantiate');
    expect(names).toContain('mahjong.world.compile');
    expect(names).toContain('mahjong.world.simulate');
    expect(names).toContain('mahjong.world.find-counterexample');
    expect(MAHJONG_LANGUAGE_SYSTEM_PROMPT).toContain('never TypeScript');
    expect(MAHJONG_LANGUAGE_SYSTEM_PROMPT).toContain('RuleModuleDefinition');
    expect(MAHJONG_LANGUAGE_SYSTEM_PROMPT).toContain('Do not claim success');
  });
});
