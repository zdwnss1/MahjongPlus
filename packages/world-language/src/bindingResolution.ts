import type { WorldSource } from './ast.js';
import {
  instantiateRuleModule,
  type RuleModuleApplication,
  type RuleModuleDefinition,
  type RuleModuleManifest,
} from './ruleModules.js';

export type RuleModuleBindingSelector =
  | {
      kind: 'entity-id';
      id?: string;
      entityKind?: string;
      component?: string;
      cardinality?: 'one' | 'many';
    }
  | {
      kind: 'zone-id';
      id?: string;
      zoneKind?: string;
      cardinality?: 'one' | 'many';
    }
  | { kind: 'action-id'; id: string }
  | { kind: 'procedure-id'; id: string }
  | {
      kind: 'procedure-node-id';
      nodeId: string;
      procedureId?: string;
      procedureBinding?: string;
    }
  | { kind: 'world-metadata'; path: string }
  | { kind: 'relation-type'; value: string; requireExisting?: boolean }
  | { kind: 'artifact'; moduleId: string; path: string }
  | { kind: 'literal'; value: unknown }
  | {
      kind: 'derived';
      operation: 'cycle-pairs';
      sourceBinding: string;
      actorField?: string;
      nextField?: string;
    }
  | {
      kind: 'derived';
      operation: 'null-records';
      sourceBinding: string;
      idField?: string;
      nullFields: string[];
    }
  | {
      kind: 'derived';
      operation: 'zone-entry-candidates';
      sourceBinding: string;
      offset?: number;
      stride?: number;
      limit?: number;
      ordinal?: 'source' | 'sequence';
    };

export type RuleModuleBindingSelectors = Record<string, RuleModuleBindingSelector>;

export interface BindingResolutionDiagnostic {
  severity: 'error' | 'warning';
  code:
    | 'missing-selector'
    | 'no-match'
    | 'ambiguous-match'
    | 'unresolved-dependency'
    | 'invalid-source'
    | 'unknown-artifact'
    | 'unknown-metadata'
    | 'invalid-selector';
  binding: string;
  message: string;
  moduleId: string;
}

export interface RuleModuleBindingResolution {
  bindings: Record<string, unknown>;
  diagnostics: BindingResolutionDiagnostic[];
  resolved: boolean;
}

export interface AutoModuleCompositionResult {
  world: WorldSource;
  artifacts: Record<string, unknown>;
  manifests: RuleModuleManifest[];
  resolvedApplications: RuleModuleApplication[];
  diagnostics: BindingResolutionDiagnostic[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function lookup(root: unknown, path: string): unknown {
  let current = root;
  for (const part of path.split('.').filter(Boolean)) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function readRuleModuleBindingSelectors(
  definition: RuleModuleDefinition,
): RuleModuleBindingSelectors {
  const metadata = asRecord(definition.metadata);
  const value = asRecord(metadata?.bindingSelectors);
  return clone((value ?? {}) as RuleModuleBindingSelectors);
}

export function withRuleModuleBindingSelectors(
  definition: RuleModuleDefinition,
  selectors: RuleModuleBindingSelectors,
): RuleModuleDefinition {
  return {
    ...clone(definition),
    metadata: {
      ...(clone(definition.metadata ?? {})),
      bindingSelectors: clone(selectors),
    },
  };
}

interface SelectorResult {
  status: 'resolved' | 'pending' | 'error';
  value?: unknown;
  code?: BindingResolutionDiagnostic['code'];
  message?: string;
}

function oneOrMany(
  values: string[],
  cardinality: 'one' | 'many' | undefined,
  label: string,
): SelectorResult {
  if ((cardinality ?? 'one') === 'many') return { status: 'resolved', value: values };
  if (values.length === 0) return { status: 'error', code: 'no-match', message: `${label} matched no values.` };
  if (values.length > 1) {
    return {
      status: 'error',
      code: 'ambiguous-match',
      message: `${label} matched multiple values: ${values.join(', ')}.`,
    };
  }
  return { status: 'resolved', value: values[0] };
}

function resolveDerived(
  world: WorldSource,
  selector: Extract<RuleModuleBindingSelector, { kind: 'derived' }>,
  bindings: Record<string, unknown>,
): SelectorResult {
  if (!(selector.sourceBinding in bindings)) return { status: 'pending' };
  const source = bindings[selector.sourceBinding];
  if (selector.operation === 'cycle-pairs') {
    if (!Array.isArray(source) || source.some((entry) => typeof entry !== 'string')) {
      return { status: 'error', code: 'invalid-source', message: 'cycle-pairs requires a string-array source binding.' };
    }
    const actorField = selector.actorField ?? 'actorId';
    const nextField = selector.nextField ?? 'nextActorId';
    return {
      status: 'resolved',
      value: source.map((actorId, index) => ({
        [actorField]: actorId,
        [nextField]: source[(index + 1) % source.length],
      })),
    };
  }
  if (selector.operation === 'null-records') {
    if (!Array.isArray(source)) {
      return { status: 'error', code: 'invalid-source', message: 'null-records requires an array source binding.' };
    }
    const idField = selector.idField ?? 'subjectId';
    return {
      status: 'resolved',
      value: source.map((id) => Object.fromEntries([
        [idField, id],
        ...selector.nullFields.map((field) => [field, null]),
      ])),
    };
  }
  if (typeof source !== 'string') {
    return { status: 'error', code: 'invalid-source', message: 'zone-entry-candidates requires a zone-id source binding.' };
  }
  const zone = world.zones.find((entry) => entry.id === source);
  if (!zone) return { status: 'error', code: 'invalid-source', message: `Unknown source zone ${source}.` };
  const offset = selector.offset ?? 0;
  const stride = selector.stride ?? 1;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(stride) || stride < 1) {
    return { status: 'error', code: 'invalid-selector', message: 'Zone candidate offset/stride must be non-negative/positive integers.' };
  }
  const entries = zone.entries.filter((_entry, index) => index >= offset && (index - offset) % stride === 0);
  const limited = selector.limit == null ? entries : entries.slice(0, selector.limit);
  return {
    status: 'resolved',
    value: limited.map((entry, index) => ({
      tileId: entry.entityId,
      ordinal: selector.ordinal === 'source' ? entry.ordinal : index,
    })),
  };
}

function resolveSelector(
  world: WorldSource,
  selector: RuleModuleBindingSelector,
  bindings: Record<string, unknown>,
  artifacts: Record<string, unknown>,
): SelectorResult {
  if (selector.kind === 'entity-id') {
    const values = world.entities
      .filter((entry) => (!selector.id || entry.id === selector.id)
        && (!selector.entityKind || entry.kind === selector.entityKind)
        && (!selector.component || selector.component in entry.components))
      .map((entry) => entry.id);
    return oneOrMany(values, selector.cardinality, 'entity selector');
  }
  if (selector.kind === 'zone-id') {
    const values = world.zones
      .filter((entry) => (!selector.id || entry.id === selector.id)
        && (!selector.zoneKind || entry.kind === selector.zoneKind))
      .map((entry) => entry.id);
    return oneOrMany(values, selector.cardinality, 'zone selector');
  }
  if (selector.kind === 'action-id') {
    return world.actions.some((entry) => entry.id === selector.id)
      ? { status: 'resolved', value: selector.id }
      : { status: 'error', code: 'no-match', message: `Unknown action ${selector.id}.` };
  }
  if (selector.kind === 'procedure-id') {
    return world.procedures.some((entry) => entry.id === selector.id)
      ? { status: 'resolved', value: selector.id }
      : { status: 'error', code: 'no-match', message: `Unknown procedure ${selector.id}.` };
  }
  if (selector.kind === 'procedure-node-id') {
    const procedureId = selector.procedureBinding
      ? bindings[selector.procedureBinding]
      : selector.procedureId;
    if (selector.procedureBinding && procedureId === undefined) return { status: 'pending' };
    if (typeof procedureId !== 'string') {
      return { status: 'error', code: 'invalid-source', message: 'Procedure-node selector requires a procedure id.' };
    }
    const procedure = world.procedures.find((entry) => entry.id === procedureId);
    if (!procedure?.nodes.some((entry) => entry.id === selector.nodeId)) {
      return { status: 'error', code: 'no-match', message: `Unknown procedure node ${procedureId}/${selector.nodeId}.` };
    }
    return { status: 'resolved', value: selector.nodeId };
  }
  if (selector.kind === 'world-metadata') {
    const value = lookup(world.metadata, selector.path);
    return value === undefined
      ? { status: 'error', code: 'unknown-metadata', message: `World metadata path ${selector.path} is undefined.` }
      : { status: 'resolved', value: clone(value) };
  }
  if (selector.kind === 'relation-type') {
    if (selector.requireExisting && !world.relations.some((entry) => entry.type === selector.value)) {
      return { status: 'error', code: 'no-match', message: `Relation type ${selector.value} is not present in the world.` };
    }
    return { status: 'resolved', value: selector.value };
  }
  if (selector.kind === 'artifact') {
    const moduleArtifacts = artifacts[selector.moduleId];
    const value = lookup(moduleArtifacts, selector.path);
    return value === undefined
      ? { status: 'error', code: 'unknown-artifact', message: `Artifact ${selector.moduleId}.${selector.path} is undefined.` }
      : { status: 'resolved', value: clone(value) };
  }
  if (selector.kind === 'literal') return { status: 'resolved', value: clone(selector.value) };
  return resolveDerived(world, selector, bindings);
}

export function resolveRuleModuleBindings(
  world: WorldSource,
  definition: RuleModuleDefinition,
  supplied: Record<string, unknown> = {},
  artifacts: Record<string, unknown> = {},
): RuleModuleBindingResolution {
  const bindings = clone(supplied);
  const diagnostics: BindingResolutionDiagnostic[] = [];
  const selectors = readRuleModuleBindingSelectors(definition);
  const pending = new Set(Object.keys(selectors).filter((binding) => !(binding in bindings)));

  for (let pass = 0; pass <= pending.size; pass += 1) {
    let progress = false;
    for (const binding of [...pending]) {
      const result = resolveSelector(world, selectors[binding], bindings, artifacts);
      if (result.status === 'pending') continue;
      pending.delete(binding);
      progress = true;
      if (result.status === 'resolved') bindings[binding] = clone(result.value);
      else diagnostics.push({
        severity: 'error',
        code: result.code ?? 'invalid-selector',
        binding,
        message: result.message ?? `Binding ${binding} could not be resolved.`,
        moduleId: definition.id,
      });
    }
    if (!progress) break;
  }

  for (const binding of definition.requiredBindings ?? []) {
    if (binding in bindings) continue;
    if (pending.has(binding)) {
      diagnostics.push({
        severity: 'error',
        code: 'unresolved-dependency',
        binding,
        message: `Binding ${binding} depends on another unresolved binding.`,
        moduleId: definition.id,
      });
    } else if (!(binding in selectors)) {
      diagnostics.push({
        severity: 'error',
        code: 'missing-selector',
        binding,
        message: `Module ${definition.id} has no selector or supplied value for binding ${binding}.`,
        moduleId: definition.id,
      });
    }
  }
  return {
    bindings,
    diagnostics,
    resolved: !diagnostics.some((entry) => entry.severity === 'error')
      && (definition.requiredBindings ?? []).every((binding) => binding in bindings),
  };
}

export function composeWorldModulesWithAutoBindings(
  base: WorldSource,
  applications: RuleModuleApplication[],
): AutoModuleCompositionResult {
  let world = clone(base);
  const artifacts: Record<string, unknown> = {};
  const manifests: RuleModuleManifest[] = [];
  const resolvedApplications: RuleModuleApplication[] = [];
  const diagnostics: BindingResolutionDiagnostic[] = [];

  for (const application of applications) {
    const resolution = resolveRuleModuleBindings(
      world,
      application.definition,
      application.bindings ?? {},
      artifacts,
    );
    diagnostics.push(...resolution.diagnostics);
    if (!resolution.resolved) break;
    const resolvedApplication: RuleModuleApplication = {
      ...application,
      bindings: resolution.bindings,
    };
    const result = instantiateRuleModule(world, resolvedApplication);
    world = result.world;
    artifacts[application.definition.id] = result.artifacts;
    manifests.push(result.manifest);
    resolvedApplications.push(resolvedApplication);
  }
  return { world, artifacts, manifests, resolvedApplications, diagnostics };
}
