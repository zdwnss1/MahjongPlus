import { describe, expect, it } from 'vitest';
import { compileWorld, type WorldSource } from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';

const literal = (value: unknown) => ({ kind: 'literal', value } as const);
const variable = (name: string) => ({ kind: 'variable', name } as const);
const path = (target: ReturnType<typeof variable>, ...parts: string[]) => ({ kind: 'path', target, path: parts } as const);
const compare = (operator: 'eq' | 'gte', left: any, right: any) => ({ kind: 'compare', operator, left, right } as const);

function source(): WorldSource {
  return {
    schemaVersion: 'mwl/0.3',
    id: 'calculus-runtime-fixture',
    entities: [
      { id: 'p1', kind: 'player', components: { score: { value: 25000 } } },
      { id: 'token', kind: 'tile', components: { tile: { face: 'x1' } } },
    ],
    zones: [
      {
        id: 'zone:a', kind: 'test', ordered: true, metadata: {},
        entries: [{ slotId: 'zone:a:0', entityId: 'token', ordinal: 0, metadata: {}, state: 'occupied' }],
      },
      { id: 'zone:b', kind: 'test', ordered: true, metadata: {}, entries: [] },
    ],
    relations: [],
    procedures: [],
    responseWindows: [],
    bootstrap: [],
    corePrograms: {
      constraints: [{
        id: 'requires-two-signals',
        variables: [],
        constraints: [compare('gte', path(variable('reducers'), 'signal-streak', 'count'), literal(2))],
      }],
      reducers: [{
        id: 'signal-streak',
        initialState: { count: 0 },
        transitions: [{
          when: compare('eq', path(variable('event'), 'type'), literal('signal')), 
          updates: [{
            path: ['count'],
            value: {
              kind: 'arithmetic', operator: 'add',
              left: path(variable('state'), 'count'), right: literal(1),
            },
          }],
        }],
      }, {
        id: 'movement-count',
        initialState: { count: 0 },
        transitions: [{
          when: compare('eq', path(variable('event'), 'type'), literal('entity.moved')),
          updates: [{
            path: ['count'],
            value: {
              kind: 'arithmetic', operator: 'add',
              left: path(variable('state'), 'count'), right: literal(1),
            },
          }],
        }],
      }],
      rewrites: [{
        id: 'raise-score',
        operations: [{
          kind: 'set',
          path: ['world', 'entities', '0', 'components', 'score', 'value'],
          value: literal(26000),
        }],
      }, {
        id: 'invalid-rewrite',
        operations: [{ kind: 'set', path: ['world', 'missing', 'value'], value: literal(true) }],
      }],
    },
    actions: [{
      id: 'signal', parameters: {}, requirements: [],
      effects: [{ kind: 'event.emit', eventType: 'signal', payload: {} }],
    }, {
      id: 'gated', parameters: {},
      requirements: [{ id: 'gated.threshold', kind: 'core.constraint', programId: 'requires-two-signals', message: 'Need two signals.' }],
      effects: [],
    }, {
      id: 'rewrite-score', parameters: {}, requirements: [],
      effects: [{ kind: 'core.rewrite', programId: 'raise-score' }],
    }, {
      id: 'move-then-fail', parameters: {}, requirements: [],
      effects: [
        { kind: 'zone.move-entity', entity: literal('token'), fromZone: literal('zone:a'), toZone: literal('zone:b') },
        { kind: 'core.rewrite', programId: 'invalid-rewrite' },
      ],
    }],
  };
}

function attempt(runtime: WorldRuntime, attemptId: string, actionId: string) {
  return runtime.attempt({ attemptId, actorId: 'p1', actionId, observedRevision: runtime.currentRevision, parameters: {} });
}

describe('closed calculus runtime hooks', () => {
  it('advances reducers from committed domain events and gates later actions', () => {
    const runtime = new WorldRuntime(compileWorld(source()));
    expect(attempt(runtime, 'g0', 'gated').outcome).toBe('rejected');
    expect(attempt(runtime, 's1', 'signal').outcome).toBe('executed');
    expect(attempt(runtime, 'g1', 'gated').outcome).toBe('rejected');
    expect(attempt(runtime, 's2', 'signal').outcome).toBe('executed');
    expect(runtime.coreReducerState<{ count: number }>('signal-streak').count).toBe(2);
    expect(attempt(runtime, 'g2', 'gated').outcome).toBe('executed');
  });

  it('executes a generic rewrite inside the action transaction', () => {
    const runtime = new WorldRuntime(compileWorld(source()));
    expect(attempt(runtime, 'rw', 'rewrite-score').outcome).toBe('executed');
    expect((runtime.store.readComponent<any>('p1', 'score')).value).toBe(26000);
  });

  it('rolls back moves, events and reducer state when a later rewrite fails', () => {
    const runtime = new WorldRuntime(compileWorld(source()));
    const receipt = attempt(runtime, 'bad', 'move-then-fail');
    expect(receipt.outcome).toBe('invalid');
    expect(runtime.store.zoneEntityIds('zone:a')).toEqual(['token']);
    expect(runtime.store.zoneEntityIds('zone:b')).toEqual([]);
    expect(runtime.coreReducerState<{ count: number }>('movement-count').count).toBe(0);
    expect(runtime.journal.all().some((event) => event.type === 'entity.moved')).toBe(false);
  });

  it('rejects unknown core program references during compilation', () => {
    const invalid = source();
    invalid.actions[0].requirements.push({
      id: 'missing', kind: 'core.constraint', programId: 'not-there', message: 'missing',
    });
    expect(() => compileWorld(invalid)).toThrow(/unknown core constraint/i);
  });
});
