import {
  readRuleModuleBindingSelectors,
  stableHash,
  type RuleIntentGraph,
  type RuleIntentNode,
  type RuleModuleDefinition,
} from '@mahjongplus/world-language';
import { RIICHI_RULE_MODULES } from './ruleModuleCatalog.js';

function bridgeModule(
  definition: RuleModuleDefinition,
  nodes: RuleIntentNode[],
  edges: RuleIntentGraph['edges'],
  conflicts: RuleIntentGraph['conflicts'] = [],
): RuleIntentGraph {
  return {
    schemaVersion: 'mahjong-rule-intent/0.1',
    id: definition.id,
    version: definition.version,
    title: definition.title,
    description: definition.description,
    parameters: structuredClone(definition.parameters),
    requiredBindings: structuredClone(definition.requiredBindings),
    bindingSelectors: readRuleModuleBindingSelectors(definition),
    nodes,
    edges,
    conflicts,
    lowerings: [{
      id: `${definition.id}.bridge`,
      kind: 'module-fragment',
      nodeIds: nodes.map((node) => node.id),
      additions: structuredClone(definition.additions),
      patches: structuredClone(definition.patches),
      artifacts: structuredClone(definition.artifacts),
    }],
    metadata: { migration: 'traceable-module-fragment', sourceModuleHash: stableHash(definition) },
  };
}
function catalogModule(id: string): RuleModuleDefinition {
  const definition = RIICHI_RULE_MODULES.find((module) => module.id === id);
  if (!definition) throw new Error(`Unknown riichi module ${id}.`);
  return definition;
}

export const SUPER_RIICHI_INTENT_GRAPH = bridgeModule(catalogModule('rule.super-riichi'), [
  { id: 'declare', kind: 'trigger', source: 'action', targetId: 'declare-riichi', description: 'Player selects standard or enhanced declaration mode.' },
  { id: 'scope', kind: 'condition', formula: { kind: 'boolean', value: true }, description: 'Enhanced mode is global or restricted to the configured owner.' },
  { id: 'balance', kind: 'condition', formula: { kind: 'boolean', value: true }, description: 'The selected account can pay the selected stake.' },
  { id: 'indicator-capacity', kind: 'condition', formula: { kind: 'boolean', value: true }, description: 'The reveal track has capacity or the wall may be extended.' },
  { id: 'stake', kind: 'effect', channel: 'resource-ledger.points', operation: 'transfer' },
  { id: 'declaration', kind: 'fact', factType: 'public-declaration', scope: 'hand', lifetime: 'until-hand-end', visibility: 'public' },
  { id: 'han', kind: 'fact', factType: 'score-contribution', scope: 'player-hand', lifetime: 'until-hand-end', visibility: 'server' },
  { id: 'discard-lock', kind: 'fact', factType: 'discard-policy', scope: 'player-hand', lifetime: 'until-hand-end', visibility: 'owner' },
  { id: 'furiten', kind: 'fact', factType: 'missed-opportunity-policy', scope: 'player-hand', lifetime: 'until-hand-end', visibility: 'server' },
  { id: 'reveal', kind: 'effect', channel: 'visibility.reveal-track', operation: 'append-public-observation' },
  { id: 'wall-boundary', kind: 'effect', channel: 'zone.wall-boundary', operation: 'move-live-tail-to-dead-wall' },
  { id: 'declare-consumer', kind: 'consumer', consumerType: 'action', targetId: 'declare-riichi' },
], [
  { id: 'declare-requires-scope', from: 'declare-consumer', to: 'scope', kind: 'requires' },
  { id: 'declare-requires-balance', from: 'declare-consumer', to: 'balance', kind: 'requires' },
  { id: 'declare-requires-capacity', from: 'declare-consumer', to: 'indicator-capacity', kind: 'requires' },
  ...['stake', 'declaration', 'han', 'discard-lock', 'furiten', 'reveal', 'wall-boundary'].map((to) => ({ id: `declare-produces-${to}`, from: 'declare', to, kind: 'produces' as const })),
], [
  { id: 'super-ledger-write', channel: 'resource-ledger.points', mode: 'last-write-forbidden', nodeIds: ['stake', 'declare-consumer'] },
  { id: 'super-wall-write', channel: 'zone.wall-boundary', mode: 'ordered', nodeIds: ['reveal', 'wall-boundary'] },
]);

export const TURBO_DECLARATION_INTENT_GRAPH = bridgeModule(catalogModule('rule.turbo-riichi.declaration'), [
  { id: 'declare', kind: 'trigger', source: 'action', targetId: 'declare-turbo-riichi' },
  { id: 'closed-triplet', kind: 'condition', formula: { kind: 'boolean', value: true }, description: 'Three distinct concealed physical tiles are the same suited seven.' },
  { id: 'balance', kind: 'condition', formula: { kind: 'boolean', value: true } },
  { id: 'stake', kind: 'effect', channel: 'resource-ledger.points', operation: 'transfer' },
  { id: 'declaration', kind: 'fact', factType: 'public-declaration', scope: 'hand', lifetime: 'until-hand-end', visibility: 'public' },
  { id: 'proof-visibility', kind: 'fact', factType: 'entity-visibility', scope: 'hand', lifetime: 'until-hand-end', visibility: 'public' },
  { id: 'han', kind: 'fact', factType: 'score-contribution', scope: 'player-hand', lifetime: 'until-hand-end', visibility: 'server' },
  { id: 'all-player-discard-policy', kind: 'fact', factType: 'discard-policy', scope: 'hand', lifetime: 'until-hand-end', visibility: 'server' },
  { id: 'furiten-policy', kind: 'fact', factType: 'missed-opportunity-policy', scope: 'player-hand', lifetime: 'until-hand-end', visibility: 'server' },
  { id: 'declare-consumer', kind: 'consumer', consumerType: 'action', targetId: 'declare-turbo-riichi' },
], [
  { id: 'declare-needs-triplet', from: 'declare-consumer', to: 'closed-triplet', kind: 'requires' },
  { id: 'declare-needs-balance', from: 'declare-consumer', to: 'balance', kind: 'requires' },
  ...['stake', 'declaration', 'proof-visibility', 'han', 'all-player-discard-policy', 'furiten-policy'].map((to) => ({ id: `declare-produces-${to}`, from: 'declare', to, kind: 'produces' as const })),
], [{ id: 'turbo-policy-write', channel: 'policy.discard-selection', mode: 'ordered', nodeIds: ['all-player-discard-policy', 'declare-consumer'] }]);

export const CONTINUING_MULTI_WIN_INTENT_GRAPH = bridgeModule(catalogModule('flow.continuing-multi-win'), [
  { id: 'draw', kind: 'trigger', source: 'action', targetId: 'draw' },
  { id: 'discard', kind: 'trigger', source: 'action', targetId: 'discard' },
  { id: 'latest-draw', kind: 'state', stateType: 'latest-draw-by-player', scope: 'hand', initialValue: [] },
  { id: 'win-count', kind: 'state', stateType: 'win-count-by-player', scope: 'hand', initialValue: [] },
  { id: 'tsumogiri-gate', kind: 'condition', formula: { kind: 'boolean', value: true } },
  { id: 'win-limit', kind: 'condition', formula: { kind: 'boolean', value: true } },
  { id: 'ron-outcome', kind: 'outcome', outcomeType: 'ron', continuing: true },
  { id: 'tsumo-outcome', kind: 'outcome', outcomeType: 'tsumo', continuing: true },
  { id: 'response-batch', kind: 'fact', factType: 'outcome-batch', scope: 'hand', lifetime: 'until-consumed', visibility: 'server' },
  { id: 'draw-consumer', kind: 'consumer', consumerType: 'action', targetId: 'draw' },
  { id: 'discard-consumer', kind: 'consumer', consumerType: 'action', targetId: 'discard' },
  { id: 'response-consumer', kind: 'consumer', consumerType: 'response' },
  { id: 'settlement-consumer', kind: 'consumer', consumerType: 'settlement' },
], [
  { id: 'draw-modifies-latest', from: 'draw', to: 'latest-draw', kind: 'modifies' },
  { id: 'discard-requires-policy', from: 'discard-consumer', to: 'tsumogiri-gate', kind: 'requires' },
  { id: 'response-requires-limit', from: 'response-consumer', to: 'win-limit', kind: 'requires' },
  { id: 'response-produces-ron', from: 'response-consumer', to: 'ron-outcome', kind: 'produces' },
  { id: 'draw-produces-tsumo', from: 'draw-consumer', to: 'tsumo-outcome', kind: 'produces' },
  { id: 'ron-to-batch', from: 'ron-outcome', to: 'response-batch', kind: 'produces' },
  { id: 'tsumo-to-batch', from: 'tsumo-outcome', to: 'response-batch', kind: 'produces' },
  { id: 'batch-consumed-settlement', from: 'response-batch', to: 'settlement-consumer', kind: 'consumed-by' },
], [{ id: 'continuing-outcome-write', channel: 'outcome-batch', mode: 'commutative', nodeIds: ['ron-outcome', 'tsumo-outcome', 'response-batch'] }]);

export const STONE_ON_THREE_YEARS_INTENT_GRAPH = bridgeModule(catalogModule('local.stone-on-three-years'), [
  { id: 'win', kind: 'trigger', source: 'event', eventType: 'win.accepted' },
  { id: 'double-riichi-before', kind: 'condition', formula: { kind: 'boolean', value: true } },
  { id: 'not-cancelled', kind: 'condition', formula: { kind: 'boolean', value: true } },
  { id: 'last-live-tile-context', kind: 'condition', formula: { kind: 'boolean', value: true } },
  { id: 'award', kind: 'effect', channel: 'score-contribution.han-limit', operation: 'add-yakuman-contribution' },
  { id: 'evaluation', kind: 'consumer', consumerType: 'evaluation' },
], [
  { id: 'evaluation-needs-riichi', from: 'evaluation', to: 'double-riichi-before', kind: 'requires' },
  { id: 'evaluation-needs-active', from: 'evaluation', to: 'not-cancelled', kind: 'requires' },
  { id: 'evaluation-needs-last-tile', from: 'evaluation', to: 'last-live-tile-context', kind: 'requires' },
  { id: 'win-activates-evaluation', from: 'win', to: 'evaluation', kind: 'activates' },
  { id: 'evaluation-produces-award', from: 'evaluation', to: 'award', kind: 'produces' },
]);

export const EIGHT_CONSECUTIVE_WINS_INTENT_GRAPH = bridgeModule(catalogModule('local.eight-consecutive-wins'), [
  { id: 'hand-ended', kind: 'trigger', source: 'event', eventType: 'hand.ended' },
  { id: 'streak', kind: 'state', stateType: 'consecutive-win-count', scope: 'player-match', initialValue: 0 },
  { id: 'threshold', kind: 'condition', formula: { kind: 'boolean', value: true } },
  { id: 'independent-yaku', kind: 'condition', formula: { kind: 'boolean', value: true } },
  { id: 'award', kind: 'effect', channel: 'score-contribution.limit', operation: 'set-yakuman' },
  { id: 'evaluation', kind: 'consumer', consumerType: 'evaluation' },
], [
  { id: 'hand-updates-streak', from: 'hand-ended', to: 'streak', kind: 'modifies' },
  { id: 'evaluation-needs-threshold', from: 'evaluation', to: 'threshold', kind: 'requires' },
  { id: 'evaluation-needs-yaku', from: 'evaluation', to: 'independent-yaku', kind: 'requires' },
  { id: 'evaluation-produces-award', from: 'evaluation', to: 'award', kind: 'produces' },
]);

export const THIRD_DISCARD_PRIVATE_REVEAL_INTENT_GRAPH: RuleIntentGraph = {
  schemaVersion: 'mahjong-rule-intent/0.1',
  id: 'example.third-discard-private-reveal',
  version: '1.0.0',
  title: 'Third discard private reveal',
  description: 'After a player commits a third discard, reveal one configured physical tile only to that player.',
  requiredBindings: ['visibilityTrackId', 'revealTileId'],
  nodes: [
    { id: 'discard', kind: 'trigger', source: 'event', eventType: 'tile.discarded' },
    { id: 'discard-count', kind: 'state', stateType: 'discard-count-by-player', scope: 'hand', initialValue: [] },
    { id: 'third-discard', kind: 'condition', formula: { kind: 'boolean', value: true } },
    { id: 'private-reveal', kind: 'fact', factType: 'entity-visibility', scope: 'player-hand', lifetime: 'until-hand-end', visibility: 'owner' },
    { id: 'projection', kind: 'consumer', consumerType: 'projection' },
  ],
  edges: [
    { id: 'discard-updates-count', from: 'discard', to: 'discard-count', kind: 'modifies' },
    { id: 'count-requires-third', from: 'discard-count', to: 'third-discard', kind: 'requires' },
    { id: 'third-produces-reveal', from: 'third-discard', to: 'private-reveal', kind: 'produces' },
    { id: 'projection-consumes-reveal', from: 'private-reveal', to: 'projection', kind: 'consumed-by' },
  ],
  lowerings: [{ id: 'third-discard-bridge', kind: 'module-fragment', nodeIds: ['discard', 'discard-count', 'third-discard', 'private-reveal', 'projection'], artifacts: { status: 'intent-pressure-example', remainingLowering: 'Replace bridge with an event reducer plus visibility-track rewrite after standard projection facts are production-integrated.' } }],
  conflicts: [{ id: 'visibility-order', channel: 'visibility.entity-observation', mode: 'commutative', nodeIds: ['private-reveal', 'projection'] }],
};

export const RIICHI_RULE_INTENT_GRAPHS: RuleIntentGraph[] = [SUPER_RIICHI_INTENT_GRAPH, TURBO_DECLARATION_INTENT_GRAPH, CONTINUING_MULTI_WIN_INTENT_GRAPH, STONE_ON_THREE_YEARS_INTENT_GRAPH, EIGHT_CONSECUTIVE_WINS_INTENT_GRAPH, THIRD_DISCARD_PRIVATE_REVEAL_INTENT_GRAPH];
