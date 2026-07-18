import { describe, expect, it } from 'vitest';
import {
  applyRewriteProgram,
  coreLanguageCatalog,
  evaluateExpression,
  expandPartitionMacro,
  reduceEvents,
  solveFiniteDomain,
  solvePartitionExpansion,
  type CoreExpression,
  type CoreFormula,
} from '../src/index.js';

const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });

function memberValues(field: string): CoreExpression {
  return {
    kind: 'map',
    source: variable('members'),
    as: 'member',
    select: path(path(variable('member'), 'attributes'), field),
  };
}

function allEqual(field: string): CoreFormula {
  const values = memberValues(field);
  return compare(
    'eq',
    { kind: 'aggregate', operator: 'count', source: { kind: 'distinct', source: values } },
    literal(1),
  );
}

function consecutive(field: string): CoreFormula {
  const values = memberValues(field);
  return {
    kind: 'all',
    values: [
      compare(
        'eq',
        { kind: 'aggregate', operator: 'count', source: { kind: 'distinct', source: values } },
        { kind: 'aggregate', operator: 'count', source: values },
      ),
      compare(
        'eq',
        {
          kind: 'arithmetic',
          operator: 'subtract',
          left: { kind: 'aggregate', operator: 'max', source: values },
          right: { kind: 'aggregate', operator: 'min', source: values },
        },
        {
          kind: 'arithmetic',
          operator: 'subtract',
          left: { kind: 'aggregate', operator: 'count', source: values },
          right: literal(1),
        },
      ),
    ],
  };
}

describe('closed world calculus', () => {
  it('expresses three four-member groups plus a pair without a hand-shape primitive', () => {
    const items = [
      ...[1, 2, 3, 4].map((rank) => ({ id: `m${rank}`, attributes: { suit: 'm', rank, face: `m${rank}` } })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `p1-${index}`,
        attributes: { suit: 'p', rank: 1, face: 'p1' },
      })),
      ...[5, 6, 7, 8].map((rank) => ({ id: `s${rank}`, attributes: { suit: 's', rank, face: `s${rank}` } })),
      ...Array.from({ length: 2 }, (_, index) => ({
        id: `z1-${index}`,
        attributes: { suit: 'z', rank: 1, face: 'z1' },
      })),
    ];
    const fourGroup: CoreFormula = {
      kind: 'any',
      values: [
        allEqual('face'),
        { kind: 'all', values: [allEqual('suit'), consecutive('rank')] },
      ],
    };
    const expansion = expandPartitionMacro({
      id: 'fixture:three-four-plus-pair',
      items,
      slots: [
        { id: 'body', count: 3, alternatives: [{ id: 'four', size: 4, predicate: fourGroup }] },
        { id: 'head', count: 1, alternatives: [{ id: 'pair', size: 2, predicate: allEqual('face') }] },
      ],
      maxSolutions: 1,
      maxSteps: 1_000_000,
    });
    const result = solvePartitionExpansion(expansion);
    expect(expansion.program.constraints).toHaveLength(4);
    expect(result.satisfiable).toBe(true);
    expect(Object.keys(result.solutions[0].assignment)).toHaveLength(14);
  });

  it('models signed contributions and a later threshold with ordinary expressions', () => {
    const contributions = [
      { stage: 0, amount: 2 },
      { stage: 1, amount: -1 },
    ];
    const totalAt = (stage: number): CoreExpression => ({
      kind: 'aggregate',
      operator: 'sum',
      source: {
        kind: 'filter',
        source: literal(contributions),
        as: 'entry',
        where: compare('lte', path(variable('entry'), 'stage'), literal(stage)),
      },
      as: 'entry',
      value: path(variable('entry'), 'amount'),
    });
    expect(evaluateExpression(totalAt(0), { variables: {} })).toBe(2);
    expect(evaluateExpression(totalAt(1), { variables: {} })).toBe(1);
    const program = {
      id: 'qualification',
      variables: [],
      constraints: [compare('gte', totalAt(1), literal(1))],
    };
    expect(solveFiniteDomain(program).satisfiable).toBe(true);
  });

  it('expresses an eight-event streak with the generic reducer', () => {
    const result = reduceEvents({
      id: 'fixture:streak',
      initialState: { count: 0 },
      transitions: [{
        when: compare('eq', path(variable('event'), 'type'), literal('round.ended')),
        updates: [{
          path: ['count'],
          value: {
            kind: 'if',
            condition: compare('eq', path(variable('event'), 'winner'), variable('tracked')),
            then: {
              kind: 'arithmetic',
              operator: 'add',
              left: path(variable('state'), 'count'),
              right: literal(1),
            },
            else: literal(0),
          },
        }],
      }],
    }, Array.from({ length: 8 }, () => ({ type: 'round.ended', winner: 'east' })), { tracked: 'east' });
    expect((result.state as { count: number }).count).toBe(8);
  });

  it('applies generic graph/document rewrites atomically', () => {
    const before = { entities: [{ id: 'a', score: 1 }], events: [] as unknown[] };
    const after = applyRewriteProgram(before, {
      id: 'fixture:rewrite',
      operations: [
        { kind: 'set', path: ['entities', '0', 'score'], value: literal(2) },
        { kind: 'append', path: ['events'], value: literal({ type: 'score.changed' }) },
      ],
    });
    expect(after).toEqual({ entities: [{ id: 'a', score: 2 }], events: [{ type: 'score.changed' }] });
    expect(before.entities[0].score).toBe(1);
  });

  it('exposes a small language-level MCP catalog rather than one tool per rule', () => {
    expect(coreLanguageCatalog().tools.map((tool) => tool.name)).toEqual([
      'core.evaluate',
      'core.solve',
      'core.reduce',
      'core.rewrite',
      'core.expand',
    ]);
  });
});
