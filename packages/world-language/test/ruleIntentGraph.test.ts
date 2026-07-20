import { describe, expect, it } from 'vitest';
import {
  MahjongLanguageAuthoringSession,
  analyzeRuleIntentGraph,
  compileRuleIntentGraph,
  stableHash,
  validateRuleIntentGraph,
  type RuleIntentGraph,
} from '../src/index.js';

const NEXT_DRAW_LOCK_GRAPH: RuleIntentGraph = {
  schemaVersion: 'mahjong-rule-intent/0.1',
  id: 'example.next-draw-lock',
  version: '1.0.0',
  requiredBindings: ['discardActionId'],
  bindingSelectors: { discardActionId: { kind: 'action-id', id: 'discard' } },
  nodes: [
    { id: 'draw', kind: 'trigger', source: 'event', eventType: 'tile.drawn' },
    { id: 'latest-draw', kind: 'fact', factType: 'latest-draw', scope: 'player-hand', lifetime: 'until-next-draw', visibility: 'owner' },
    { id: 'must-discard-recorded-tile', kind: 'condition', formula: { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'params' }, path: ['tileId'] }, right: { kind: 'path', target: { kind: 'variable', name: 'reducers' }, path: ['example.next-draw-lock.latest', 'records', '0', 'tileId'] } } },
    { id: 'discard-consumer', kind: 'consumer', consumerType: 'action', targetId: 'discard' },
  ],
  edges: [
    { id: 'draw-produces-latest', from: 'draw', to: 'latest-draw', kind: 'produces' },
    { id: 'discard-requires-latest', from: 'discard-consumer', to: 'must-discard-recorded-tile', kind: 'requires' },
  ],
  lowerings: [
    { id: 'record-latest-draw', kind: 'event-record', triggerId: 'draw', factId: 'latest-draw', reducerId: 'example.next-draw-lock.latest', record: { kind: 'record', fields: { actorId: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['actorId'] }, tileId: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['objects', '0', 'id'] } } } },
    { id: 'gate-discard', kind: 'action-gate', consumerId: 'discard-consumer', conditionIds: ['must-discard-recorded-tile'], actionId: { $module: 'ref', path: 'bindings.discardActionId' }, programId: 'example.next-draw-lock.discard-eligible', message: 'The active policy requires the recorded draw.' },
  ],
};

describe('RuleIntentGraph', () => {
  it('compiles generic event facts and action gates into an ordinary rule module', () => {
    expect(validateRuleIntentGraph(NEXT_DRAW_LOCK_GRAPH).filter((entry) => entry.severity === 'error')).toEqual([]);
    const module = compileRuleIntentGraph(NEXT_DRAW_LOCK_GRAPH);
    expect(module.id).toBe(NEXT_DRAW_LOCK_GRAPH.id);
    expect(module.additions?.corePrograms?.reducers).toHaveLength(1);
    expect(module.additions?.corePrograms?.constraints).toHaveLength(1);
    expect(module.patches?.[0]).toMatchObject({ kind: 'action.requirements' });
    expect((module.artifacts?.intentGraph as { hash: string }).hash).toBe(stableHash(NEXT_DRAW_LOCK_GRAPH));
    expect((module.metadata?.ruleIntent as { nodeCount: number }).nodeCount).toBe(4);
  });

  it('is available through the authoring tool chain before module validation', () => {
    const session = new MahjongLanguageAuthoringSession();
    const validation = session.callTool('mahjong.intent.validate', { graph: NEXT_DRAW_LOCK_GRAPH }) as { diagnostics: unknown[] };
    expect(validation.diagnostics).toEqual([]);
    const analysis = session.callTool('mahjong.intent.analyze', { graph: NEXT_DRAW_LOCK_GRAPH }) as ReturnType<typeof analyzeRuleIntentGraph>;
    expect(analysis.nodeCounts.condition).toBe(1);
    const compiled = session.callTool('mahjong.intent.compile', { graph: NEXT_DRAW_LOCK_GRAPH }) as { module: { id: string }; analysis: { graphId: string } };
    expect(compiled.module.id).toBe(NEXT_DRAW_LOCK_GRAPH.id);
    expect(compiled.analysis.graphId).toBe(NEXT_DRAW_LOCK_GRAPH.id);
  });

  it('rejects missing node references and preserves warnings for unexplained intent', () => {
    const invalid: RuleIntentGraph = { ...structuredClone(NEXT_DRAW_LOCK_GRAPH), id: 'invalid.intent', lowerings: [{ id: 'bad-gate', kind: 'action-gate', consumerId: 'discard-consumer', conditionIds: ['missing-condition'], actionId: 'discard', programId: 'bad.program', message: 'bad' }] };
    const diagnostics = validateRuleIntentGraph(invalid);
    expect(diagnostics.some((entry) => entry.code === 'unknown-node' && entry.severity === 'error')).toBe(true);
    expect(() => compileRuleIntentGraph(invalid)).toThrow(/unknown node/i);
  });

  it('keeps low-level bridges attributable to semantic nodes and conflict channels', () => {
    const graph: RuleIntentGraph = {
      schemaVersion: 'mahjong-rule-intent/0.1', id: 'example.bridge', version: '1.0.0',
      nodes: [
        { id: 'trigger', kind: 'trigger', source: 'action', targetId: 'example' },
        { id: 'effect', kind: 'effect', channel: 'resource.points', operation: 'transfer' },
        { id: 'consumer', kind: 'consumer', consumerType: 'action', targetId: 'example' },
      ],
      edges: [{ id: 'produces', from: 'trigger', to: 'effect', kind: 'produces' }],
      conflicts: [{ id: 'points', channel: 'resource.points', mode: 'last-write-forbidden', nodeIds: ['effect', 'consumer'] }],
      lowerings: [{ id: 'bridge', kind: 'module-fragment', nodeIds: ['trigger', 'effect', 'consumer'], artifacts: { note: 'temporary bridge' } }],
    };
    const analysis = analyzeRuleIntentGraph(graph);
    expect(analysis.unloweredNodeIds).toEqual([]);
    expect(analysis.effectChannels).toEqual(['resource.points']);
    const module = compileRuleIntentGraph(JSON.parse(JSON.stringify(graph)) as RuleIntentGraph);
    expect((module.artifacts?.intentGraph as { conflicts: unknown[] }).conflicts).toHaveLength(1);
  });
});
