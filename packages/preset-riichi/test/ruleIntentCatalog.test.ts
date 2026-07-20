import { describe, expect, it } from 'vitest';
import {
  compileRuleIntentGraph,
  readRuleModuleBindingSelectors,
  stableHash,
  validateRuleIntentGraph,
} from '@mahjongplus/world-language';
import {
  RIICHI_RULE_INTENT_GRAPHS,
  RIICHI_RULE_MODULES,
  THIRD_DISCARD_PRIVATE_REVEAL_INTENT_GRAPH,
} from '../src/index.js';

describe('riichi rule intent catalog', () => {
  it('keeps all current pressure rules as JSON-serializable semantic graphs', () => {
    expect(RIICHI_RULE_INTENT_GRAPHS).toHaveLength(6);
    for (const graph of RIICHI_RULE_INTENT_GRAPHS) {
      const roundTrip = JSON.parse(JSON.stringify(graph));
      expect(stableHash(roundTrip)).toBe(stableHash(graph));
      expect(validateRuleIntentGraph(roundTrip).filter((entry) => entry.severity === 'error')).toEqual([]);
      const module = compileRuleIntentGraph(roundTrip);
      expect(module.id).toBe(graph.id);
      expect(module.artifacts?.intentGraph).toBeDefined();
    }
  });

  it('preserves bridged module behavior and auto-binding selectors during migration', () => {
    for (const graph of RIICHI_RULE_INTENT_GRAPHS.filter((entry) => entry.metadata?.migration === 'traceable-module-fragment')) {
      const source = RIICHI_RULE_MODULES.find((module) => module.id === graph.id);
      expect(source).toBeDefined();
      const compiled = compileRuleIntentGraph(graph);
      expect(stableHash(compiled.additions ?? {})).toBe(stableHash(source?.additions ?? {}));
      expect(stableHash(compiled.patches ?? [])).toBe(stableHash(source?.patches ?? []));
      for (const [key, value] of Object.entries(source?.artifacts ?? {})) {
        expect(stableHash(compiled.artifacts?.[key])).toBe(stableHash(value));
      }
      expect(readRuleModuleBindingSelectors(compiled)).toEqual(readRuleModuleBindingSelectors(source!));
    }
  });

  it('makes complex rule decomposition visible before lowering', () => {
    const superGraph = RIICHI_RULE_INTENT_GRAPHS.find((graph) => graph.id === 'rule.super-riichi')!;
    expect(superGraph.nodes.filter((node) => node.kind === 'fact').map((node) => node.id).sort()).toEqual(['declaration', 'discard-lock', 'furiten', 'han']);
    expect(superGraph.conflicts?.map((entry) => entry.channel).sort()).toEqual(['resource-ledger.points', 'zone.wall-boundary']);

    const continuing = RIICHI_RULE_INTENT_GRAPHS.find((graph) => graph.id === 'flow.continuing-multi-win')!;
    expect(continuing.nodes.filter((node) => node.kind === 'outcome').map((node) => node.id).sort()).toEqual(['ron-outcome', 'tsumo-outcome']);
    expect(continuing.edges?.some((edge) => edge.kind === 'consumed-by' && edge.to === 'settlement-consumer')).toBe(true);
  });

  it('admits a genuinely new rule as an explicit pressure graph without adding a rule-specific function', () => {
    expect(THIRD_DISCARD_PRIVATE_REVEAL_INTENT_GRAPH.nodes.map((node) => node.kind)).toEqual(['trigger', 'state', 'condition', 'fact', 'consumer']);
    const compiled = compileRuleIntentGraph(THIRD_DISCARD_PRIVATE_REVEAL_INTENT_GRAPH);
    expect(compiled.artifacts?.status).toBe('intent-pressure-example');
    expect((compiled.metadata?.ruleIntent as { conflicts: unknown[] }).conflicts).toHaveLength(1);
  });
});
