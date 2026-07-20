import type { CoreExpression, CoreFormula, EventReducerDefinition, FiniteDomainProgram } from '@mahjongplus/world-calculus';
import { stableHash } from './canonical.js';
import type { RuleModuleAdditions, RuleModuleDefinition, RuleModuleParameterDefinition, RuleModulePatch, ModuleTemplateValue } from './ruleModules.js';
import { validateRuleModuleDefinition } from './ruleModules.js';
import { withRuleModuleBindingSelectors, type RuleModuleBindingSelectors } from './bindingResolution.js';

export type RuleIntentNode =
  | { id: string; kind: 'trigger'; source: 'event' | 'action' | 'response' | 'procedure' | 'state'; eventType?: string; targetId?: string; description?: string }
  | { id: string; kind: 'condition'; formula: ModuleTemplateValue; description?: string }
  | { id: string; kind: 'fact'; factType: string; scope: 'event' | 'turn' | 'player-hand' | 'hand' | 'player-match' | 'match'; lifetime?: string; visibility?: 'public' | 'owner' | 'server' | 'custom'; description?: string }
  | { id: string; kind: 'effect'; channel: string; operation: string; description?: string }
  | { id: string; kind: 'state'; stateType: string; scope: 'event' | 'turn' | 'player-hand' | 'hand' | 'player-match' | 'match'; initialValue?: unknown; description?: string }
  | { id: string; kind: 'consumer'; consumerType: 'action' | 'response' | 'procedure' | 'evaluation' | 'settlement' | 'projection'; targetId?: string; description?: string }
  | { id: string; kind: 'outcome'; outcomeType: string; continuing?: boolean; description?: string };

export type RuleIntentEdgeKind = 'activates' | 'requires' | 'produces' | 'consumed-by' | 'expires-on' | 'modifies' | 'conflicts-with' | 'orders-before';
export interface RuleIntentEdge { id: string; from: string; to: string; kind: RuleIntentEdgeKind; description?: string }
export interface RuleIntentConflictDeclaration { id: string; channel: string; mode: 'exclusive' | 'ordered' | 'commutative' | 'last-write-forbidden'; nodeIds: string[]; description?: string }

export type RuleIntentLowering =
  | { id: string; kind: 'event-record'; triggerId: string; factId: string; conditionIds?: string[]; reducerId: string; record: ModuleTemplateValue; initialRecords?: ModuleTemplateValue[] }
  | { id: string; kind: 'state-reducer'; nodeId: string; reducer: ModuleTemplateValue }
  | { id: string; kind: 'action-gate'; consumerId: string; conditionIds: string[]; actionId: ModuleTemplateValue; programId: string; requirementId?: string; message: string; placement?: 'prepend' | 'append' | 'after-requirement'; anchorId?: ModuleTemplateValue }
  | { id: string; kind: 'action-effects'; consumerId: string; effectNodeIds: string[]; actionId: ModuleTemplateValue; effects: ModuleTemplateValue[]; placement?: 'prepend' | 'append' | 'after-program'; anchorId?: ModuleTemplateValue }
  | { id: string; kind: 'module-fragment'; nodeIds: string[]; additions?: RuleModuleAdditions; patches?: RuleModulePatch[]; artifacts?: Record<string, ModuleTemplateValue> };

export interface RuleIntentGraph {
  schemaVersion: 'mahjong-rule-intent/0.1';
  id: string;
  version: string;
  title?: string;
  description?: string;
  parameters?: RuleModuleParameterDefinition;
  requiredBindings?: string[];
  bindingSelectors?: RuleModuleBindingSelectors;
  nodes: RuleIntentNode[];
  edges?: RuleIntentEdge[];
  lowerings: RuleIntentLowering[];
  conflicts?: RuleIntentConflictDeclaration[];
  metadata?: Record<string, unknown>;
}

export interface RuleIntentDiagnostic {
  severity: 'error' | 'warning';
  code: 'invalid-schema-version' | 'missing-id' | 'duplicate-node' | 'duplicate-edge' | 'duplicate-lowering' | 'unknown-node' | 'wrong-node-kind' | 'unlowered-node' | 'invalid-conflict' | 'not-json-serializable' | 'invalid-compiled-module';
  message: string;
  subjectId?: string;
}

export interface RuleIntentAnalysis {
  graphId: string;
  nodeCounts: Record<RuleIntentNode['kind'], number>;
  edgeCounts: Partial<Record<RuleIntentEdgeKind, number>>;
  effectChannels: string[];
  consumerTargets: string[];
  loweredNodeIds: string[];
  unloweredNodeIds: string[];
  conflicts: RuleIntentConflictDeclaration[];
  diagnostics: RuleIntentDiagnostic[];
}

const clone = <T>(value: T): T => structuredClone(value);
function assertJsonSerializable(value: unknown, path = '$', seen = new Set<object>()): void {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') throw new Error(`${path} is not JSON serializable.`);
  if (Array.isArray(value)) { value.forEach((entry, index) => assertJsonSerializable(entry, `${path}[${index}]`, seen)); return; }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error(`${path} contains a cycle.`);
    seen.add(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${path} must be a plain object.`);
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) assertJsonSerializable(entry, `${path}.${key}`, seen);
    seen.delete(value);
  }
}

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const compare = (operator: 'eq', left: CoreExpression, right: CoreExpression): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (values: CoreFormula[]): CoreFormula => values.length === 1 ? values[0] : { kind: 'all', values };
const concat = (sources: CoreExpression[]): CoreExpression => ({ kind: 'concat', sources });
const list = (items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
const graphNodeMap = (graph: RuleIntentGraph): Map<string, RuleIntentNode> => new Map(graph.nodes.map((node) => [node.id, node]));

function loweringNodeIds(lowering: RuleIntentLowering): string[] {
  if (lowering.kind === 'event-record') return [lowering.triggerId, lowering.factId, ...(lowering.conditionIds ?? [])];
  if (lowering.kind === 'state-reducer') return [lowering.nodeId];
  if (lowering.kind === 'action-gate') return [lowering.consumerId, ...lowering.conditionIds];
  if (lowering.kind === 'action-effects') return [lowering.consumerId, ...lowering.effectNodeIds];
  return lowering.nodeIds;
}

function requireNode(nodes: Map<string, RuleIntentNode>, id: string, kinds: RuleIntentNode['kind'][], diagnostics: RuleIntentDiagnostic[], subjectId: string): RuleIntentNode | undefined {
  const node = nodes.get(id);
  if (!node) { diagnostics.push({ severity: 'error', code: 'unknown-node', subjectId, message: `Intent ${subjectId} references unknown node ${id}.` }); return undefined; }
  if (!kinds.includes(node.kind)) diagnostics.push({ severity: 'error', code: 'wrong-node-kind', subjectId, message: `Intent ${subjectId} requires node ${id} to be ${kinds.join(' or ')}, received ${node.kind}.` });
  return node;
}

export function validateRuleIntentGraph(graph: RuleIntentGraph): RuleIntentDiagnostic[] {
  const diagnostics: RuleIntentDiagnostic[] = [];
  try { assertJsonSerializable(graph); } catch (error) { diagnostics.push({ severity: 'error', code: 'not-json-serializable', message: error instanceof Error ? error.message : 'Intent graph is not JSON serializable.' }); }
  if (graph.schemaVersion !== 'mahjong-rule-intent/0.1') diagnostics.push({ severity: 'error', code: 'invalid-schema-version', message: `Unsupported intent schema ${String(graph.schemaVersion)}.` });
  if (!graph.id || !graph.version) diagnostics.push({ severity: 'error', code: 'missing-id', message: 'Intent graph id and version are required.' });
  const nodes = graphNodeMap(graph);
  if (nodes.size !== graph.nodes.length) diagnostics.push({ severity: 'error', code: 'duplicate-node', message: 'Intent node ids must be unique.' });
  const edgeIds = new Set((graph.edges ?? []).map((edge) => edge.id));
  if (edgeIds.size !== (graph.edges ?? []).length) diagnostics.push({ severity: 'error', code: 'duplicate-edge', message: 'Intent edge ids must be unique.' });
  const loweringIds = new Set(graph.lowerings.map((lowering) => lowering.id));
  if (loweringIds.size !== graph.lowerings.length) diagnostics.push({ severity: 'error', code: 'duplicate-lowering', message: 'Intent lowering ids must be unique.' });
  const allKinds = graph.nodes.map((node) => node.kind);
  for (const edge of graph.edges ?? []) { requireNode(nodes, edge.from, allKinds, diagnostics, edge.id); requireNode(nodes, edge.to, allKinds, diagnostics, edge.id); }
  for (const lowering of graph.lowerings) {
    if (lowering.kind === 'event-record') {
      requireNode(nodes, lowering.triggerId, ['trigger'], diagnostics, lowering.id);
      requireNode(nodes, lowering.factId, ['fact', 'state'], diagnostics, lowering.id);
      for (const id of lowering.conditionIds ?? []) requireNode(nodes, id, ['condition'], diagnostics, lowering.id);
    } else if (lowering.kind === 'state-reducer') requireNode(nodes, lowering.nodeId, ['state', 'fact'], diagnostics, lowering.id);
    else if (lowering.kind === 'action-gate') { requireNode(nodes, lowering.consumerId, ['consumer'], diagnostics, lowering.id); for (const id of lowering.conditionIds) requireNode(nodes, id, ['condition'], diagnostics, lowering.id); }
    else if (lowering.kind === 'action-effects') { requireNode(nodes, lowering.consumerId, ['consumer'], diagnostics, lowering.id); for (const id of lowering.effectNodeIds) requireNode(nodes, id, ['effect'], diagnostics, lowering.id); }
    else for (const id of lowering.nodeIds) requireNode(nodes, id, allKinds, diagnostics, lowering.id);
  }
  for (const conflict of graph.conflicts ?? []) {
    if (!conflict.id || !conflict.channel || conflict.nodeIds.length < 2) diagnostics.push({ severity: 'error', code: 'invalid-conflict', subjectId: conflict.id, message: 'Conflict declarations require an id, channel, and at least two nodes.' });
    for (const id of conflict.nodeIds) requireNode(nodes, id, allKinds, diagnostics, conflict.id);
  }
  const lowered = new Set(graph.lowerings.flatMap(loweringNodeIds));
  for (const node of graph.nodes) if (!lowered.has(node.id) && node.kind !== 'trigger') diagnostics.push({ severity: 'warning', code: 'unlowered-node', subjectId: node.id, message: `Intent node ${node.id} has no lowering.` });
  return diagnostics;
}

export function analyzeRuleIntentGraph(graph: RuleIntentGraph): RuleIntentAnalysis {
  const nodeCounts = Object.fromEntries((['trigger', 'condition', 'fact', 'effect', 'state', 'consumer', 'outcome'] as const).map((kind) => [kind, graph.nodes.filter((node) => node.kind === kind).length])) as Record<RuleIntentNode['kind'], number>;
  const edgeCounts: Partial<Record<RuleIntentEdgeKind, number>> = {};
  for (const edge of graph.edges ?? []) edgeCounts[edge.kind] = (edgeCounts[edge.kind] ?? 0) + 1;
  const loweredNodeIds = [...new Set(graph.lowerings.flatMap(loweringNodeIds))].sort();
  const lowered = new Set(loweredNodeIds);
  return { graphId: graph.id, nodeCounts, edgeCounts, effectChannels: [...new Set(graph.nodes.filter((node): node is Extract<RuleIntentNode, { kind: 'effect' }> => node.kind === 'effect').map((node) => node.channel))].sort(), consumerTargets: [...new Set(graph.nodes.filter((node): node is Extract<RuleIntentNode, { kind: 'consumer' }> => node.kind === 'consumer').map((node) => node.targetId).filter((value): value is string => Boolean(value)))].sort(), loweredNodeIds, unloweredNodeIds: graph.nodes.filter((node) => !lowered.has(node.id)).map((node) => node.id).sort(), conflicts: clone(graph.conflicts ?? []), diagnostics: validateRuleIntentGraph(graph) };
}

function conditionFormula(nodes: Map<string, RuleIntentNode>, id: string): ModuleTemplateValue { const node = nodes.get(id); if (!node || node.kind !== 'condition') throw new Error(`Unknown condition intent node ${id}.`); return clone(node.formula); }
function eventRecordReducer(graph: RuleIntentGraph, lowering: Extract<RuleIntentLowering, { kind: 'event-record' }>): EventReducerDefinition {
  const nodes = graphNodeMap(graph); const trigger = nodes.get(lowering.triggerId);
  if (!trigger || trigger.kind !== 'trigger' || trigger.source !== 'event' || !trigger.eventType) throw new Error(`Event-record lowering ${lowering.id} requires an event trigger with eventType.`);
  const formulas = [compare('eq', path(variable('event'), 'type'), literal(trigger.eventType)), ...(lowering.conditionIds ?? []).map((id) => conditionFormula(nodes, id) as CoreFormula)];
  return { id: lowering.reducerId, initialState: { records: clone(lowering.initialRecords ?? []) }, transitions: [{ when: all(formulas), updates: [{ path: ['records'], value: concat([path(variable('state'), 'records'), list([clone(lowering.record) as CoreExpression])]) }] }] };
}
function mergeAdditions(target: RuleModuleAdditions, source: RuleModuleAdditions = {}): void {
  for (const key of ['entities', 'zones', 'relations', 'actions', 'procedures', 'responseWindows', 'bootstrap', 'initialEvents'] as const) if (source[key]) target[key] = [...(target[key] ?? []), ...clone(source[key] as ModuleTemplateValue[])];
  if (source.corePrograms) { target.corePrograms ??= {}; for (const key of ['constraints', 'reducers', 'rewrites'] as const) if (source.corePrograms[key]) target.corePrograms[key] = [...(target.corePrograms[key] ?? []), ...clone(source.corePrograms[key] as ModuleTemplateValue[])]; }
  if (source.metadata) target.metadata = { ...(target.metadata ?? {}), ...clone(source.metadata) };
}

export function compileRuleIntentGraph(graph: RuleIntentGraph): RuleModuleDefinition {
  const diagnostics = validateRuleIntentGraph(graph); const errors = diagnostics.filter((entry) => entry.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map((entry) => entry.message).join('\n'));
  const nodes = graphNodeMap(graph); const additions: RuleModuleAdditions = {}; const patches: RuleModulePatch[] = []; const artifacts: Record<string, ModuleTemplateValue> = {};
  for (const lowering of graph.lowerings) {
    if (lowering.kind === 'event-record') { additions.corePrograms ??= {}; additions.corePrograms.reducers = [...(additions.corePrograms.reducers ?? []), eventRecordReducer(graph, lowering)]; artifacts[`fact.${lowering.factId}.reducerId`] = lowering.reducerId; }
    else if (lowering.kind === 'state-reducer') { additions.corePrograms ??= {}; additions.corePrograms.reducers = [...(additions.corePrograms.reducers ?? []), clone(lowering.reducer)]; }
    else if (lowering.kind === 'action-gate') {
      const program: FiniteDomainProgram = { id: lowering.programId, variables: [], constraints: lowering.conditionIds.map((id) => conditionFormula(nodes, id) as CoreFormula), maxSolutions: 1, maxSteps: 100_000 };
      additions.corePrograms ??= {}; additions.corePrograms.constraints = [...(additions.corePrograms.constraints ?? []), program];
      patches.push({ kind: 'action.requirements', actionId: clone(lowering.actionId), placement: lowering.placement ?? 'append', anchorId: clone(lowering.anchorId), values: [{ id: lowering.requirementId ?? `${graph.id}.${lowering.id}`, kind: 'core.constraint', programId: lowering.programId, message: lowering.message }] });
    } else if (lowering.kind === 'action-effects') patches.push({ kind: 'action.effects', actionId: clone(lowering.actionId), placement: lowering.placement ?? 'append', anchorId: clone(lowering.anchorId), values: clone(lowering.effects) });
    else { mergeAdditions(additions, lowering.additions); patches.push(...clone(lowering.patches ?? [])); Object.assign(artifacts, clone(lowering.artifacts ?? {})); }
  }
  artifacts.intentGraph = { schemaVersion: graph.schemaVersion, id: graph.id, version: graph.version, hash: stableHash(graph), nodes: graph.nodes.map((node) => ({ id: node.id, kind: node.kind })), edges: clone(graph.edges ?? []), conflicts: clone(graph.conflicts ?? []), diagnostics };
  let module: RuleModuleDefinition = { id: graph.id, version: graph.version, title: graph.title, description: graph.description, parameters: clone(graph.parameters), requiredBindings: clone(graph.requiredBindings), additions, patches, artifacts, metadata: { ...(clone(graph.metadata) ?? {}), ruleIntent: { schemaVersion: graph.schemaVersion, hash: stableHash(graph), nodeCount: graph.nodes.length, edgeCount: graph.edges?.length ?? 0, conflicts: clone(graph.conflicts ?? []) } } };
  if (graph.bindingSelectors) module = withRuleModuleBindingSelectors(module, graph.bindingSelectors);
  const moduleErrors = validateRuleModuleDefinition(module); if (moduleErrors.length > 0) throw new Error(moduleErrors.map((message) => `Compiled module: ${message}`).join('\n'));
  return module;
}
