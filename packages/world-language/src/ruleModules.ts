import type {
  ActionDefinition,
  EffectDefinition,
  RequirementDefinition,
  ResponseWindowDefinition,
  WorldCorePrograms,
  WorldSource,
} from './ast.js';
import { stableHash } from './canonical.js';
import type { DataSchema } from './dataSchema.js';
import { validateDataAgainstSchema } from './dataSchema.js';

export type ModuleTemplateValue = unknown;

export interface RuleModuleParameterDefinition {
  schema: DataSchema;
  defaults?: Record<string, unknown>;
}

export interface RuleModuleAdditions {
  entities?: ModuleTemplateValue[];
  zones?: ModuleTemplateValue[];
  relations?: ModuleTemplateValue[];
  actions?: ModuleTemplateValue[];
  procedures?: ModuleTemplateValue[];
  responseWindows?: ModuleTemplateValue[];
  corePrograms?: {
    constraints?: ModuleTemplateValue[];
    reducers?: ModuleTemplateValue[];
    rewrites?: ModuleTemplateValue[];
  };
  bootstrap?: ModuleTemplateValue[];
  initialEvents?: ModuleTemplateValue[];
  metadata?: Record<string, ModuleTemplateValue>;
}

export type RuleModulePatch =
  | {
      kind: 'action.effects';
      actionId: ModuleTemplateValue;
      placement: 'prepend' | 'append' | 'after-program';
      anchorId?: ModuleTemplateValue;
      values: ModuleTemplateValue[];
    }
  | {
      kind: 'action.requirements';
      actionId: ModuleTemplateValue;
      placement: 'prepend' | 'append' | 'after-requirement';
      anchorId?: ModuleTemplateValue;
      values: ModuleTemplateValue[];
    }
  | {
      kind: 'response.selection-effects';
      windowId: ModuleTemplateValue;
      actionId: ModuleTemplateValue;
      placement: 'prepend' | 'append' | 'after-program';
      anchorId?: ModuleTemplateValue;
      values: ModuleTemplateValue[];
    }
  | {
      kind: 'response.no-selection-effects';
      windowId: ModuleTemplateValue;
      placement: 'prepend' | 'append' | 'after-program';
      anchorId?: ModuleTemplateValue;
      values: ModuleTemplateValue[];
    }
  | {
      kind: 'procedure.node-effects';
      procedureId: ModuleTemplateValue;
      nodeId: ModuleTemplateValue;
      placement: 'prepend' | 'append' | 'after-program';
      anchorId?: ModuleTemplateValue;
      values: ModuleTemplateValue[];
    }
  | {
      kind: 'metadata.merge';
      value: ModuleTemplateValue;
    };

export interface RuleModuleDefinition {
  id: string;
  version: string;
  title?: string;
  description?: string;
  parameters?: RuleModuleParameterDefinition;
  requiredBindings?: string[];
  additions?: RuleModuleAdditions;
  patches?: RuleModulePatch[];
  artifacts?: Record<string, ModuleTemplateValue>;
  metadata?: Record<string, unknown>;
}

export interface RuleModuleApplication {
  definition: RuleModuleDefinition;
  parameters?: Record<string, unknown>;
  bindings?: Record<string, unknown>;
}

export interface RuleModuleManifest {
  id: string;
  version: string;
  title?: string;
  hash: string;
  parameters: Record<string, unknown>;
  bindings: Record<string, unknown>;
  artifactKeys: string[];
}

export interface RuleModuleInstantiation {
  world: WorldSource;
  artifacts: Record<string, unknown>;
  manifest: RuleModuleManifest;
}

interface ModuleEvaluationContext {
  module: { id: string; version: string; title?: string };
  parameters: Record<string, unknown>;
  bindings: Record<string, unknown>;
  locals: Record<string, unknown>;
  world: WorldSource;
}

const clone = <T>(value: T): T => structuredClone(value);

function lookup(root: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function requireLookup(root: unknown, path: string): unknown {
  const value = lookup(root, path);
  if (value === undefined) throw new Error(`Rule module reference ${path} is undefined.`);
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must resolve to an array.`);
  return value;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must resolve to an object.`);
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must resolve to a finite number.`);
  return value;
}

function resolveModuleNode(record: Record<string, unknown>, context: ModuleEvaluationContext): unknown {
  const operation = record.$module;
  if (typeof operation !== 'string') return undefined;

  if (operation === 'ref') {
    if (typeof record.path !== 'string') throw new Error('Module ref requires a path.');
    return clone(requireLookup(context, record.path));
  }
  if (operation === 'template') {
    if (typeof record.value !== 'string') throw new Error('Module template requires a string value.');
    return record.value.replace(/\$\{([^}]+)\}/g, (_match, path: string) => String(requireLookup(context, path)));
  }
  if (operation === 'entity-index' || operation === 'zone-index') {
    const id = resolveModuleValue(record.id, context);
    if (typeof id !== 'string') throw new Error(`${operation} requires a string id.`);
    const values = operation === 'entity-index' ? context.world.entities : context.world.zones;
    const index = values.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error(`Unknown ${operation === 'entity-index' ? 'entity' : 'zone'} ${id}.`);
    return String(index);
  }
  if (operation === 'concat') {
    const values = asArray(resolveModuleValue(record.values, context), 'Module concat values');
    if (values.every(Array.isArray)) return values.flatMap((entry) => entry as unknown[]);
    if (values.every((entry) => typeof entry === 'string')) return values.join('');
    throw new Error('Module concat requires all arrays or all strings.');
  }
  if (operation === 'if') {
    return resolveModuleValue(Boolean(resolveModuleValue(record.condition, context)) ? record.then : record.else, context);
  }
  if (operation === 'eq') {
    return JSON.stringify(resolveModuleValue(record.left, context)) === JSON.stringify(resolveModuleValue(record.right, context));
  }
  if (operation === 'not') return !Boolean(resolveModuleValue(record.value, context));
  if (operation === 'map' || operation === 'filter') {
    const source = asArray(resolveModuleValue(record.source, context), `Module ${operation} source`);
    if (typeof record.as !== 'string' || record.as.length === 0) throw new Error(`Module ${operation} requires an as name.`);
    return operation === 'map'
      ? source.map((entry) => resolveModuleValue(record.value, {
          ...context,
          locals: { ...context.locals, [record.as as string]: entry },
        }))
      : source.filter((entry) => Boolean(resolveModuleValue(record.where, {
          ...context,
          locals: { ...context.locals, [record.as as string]: entry },
        })));
  }
  if (operation === 'range') {
    const count = asNumber(resolveModuleValue(record.count, context), 'Module range count');
    if (!Number.isInteger(count) || count < 0) throw new Error('Module range count must be a non-negative integer.');
    const values = Array.from({ length: count }, (_, index) => index);
    if (record.value === undefined) return values;
    const as = typeof record.as === 'string' ? record.as : 'index';
    return values.map((entry) => resolveModuleValue(record.value, {
      ...context,
      locals: { ...context.locals, [as]: entry },
    }));
  }
  if (operation === 'merge') {
    const values = asArray(resolveModuleValue(record.values, context), 'Module merge values');
    return Object.assign({}, ...values.map((entry) => asObject(entry, 'Module merge entry')));
  }
  if (operation === 'arithmetic') {
    const left = asNumber(resolveModuleValue(record.left, context), 'Module arithmetic left');
    const right = asNumber(resolveModuleValue(record.right, context), 'Module arithmetic right');
    if (record.operator === 'add') return left + right;
    if (record.operator === 'subtract') return left - right;
    if (record.operator === 'multiply') return left * right;
    if (record.operator === 'divide') {
      if (right === 0) throw new Error('Module arithmetic division by zero.');
      return left / right;
    }
    if (record.operator === 'modulo') {
      if (right === 0) throw new Error('Module arithmetic modulo by zero.');
      return left % right;
    }
    throw new Error(`Unknown module arithmetic operator ${String(record.operator)}.`);
  }
  throw new Error(`Unknown module template operation ${operation}.`);
}

export function resolveModuleValue<T>(value: T, context: ModuleEvaluationContext): T {
  if (Array.isArray(value)) return value.map((entry) => resolveModuleValue(entry, context)) as T;
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if ('$module' in record) return resolveModuleNode(record, context) as T;
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, resolveModuleValue(entry, context)])) as T;
}

function assertJsonSerializable(value: unknown, path = '$', seen = new Set<object>()): void {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') {
    throw new Error(`${path} is not JSON serializable.`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSerializable(entry, `${path}[${index}]`, seen));
    return;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error(`${path} contains a cycle.`);
    seen.add(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${path} must be a plain object.`);
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      assertJsonSerializable(entry, `${path}.${key}`, seen);
    }
    seen.delete(value);
    return;
  }
  throw new Error(`${path} is not JSON serializable.`);
}

export function validateRuleModuleDefinition(definition: RuleModuleDefinition): string[] {
  const errors: string[] = [];
  try {
    assertJsonSerializable(definition);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Module is not JSON serializable.');
  }
  if (!definition.id) errors.push('Rule module id is required.');
  if (!definition.version) errors.push('Rule module version is required.');
  if (definition.requiredBindings && new Set(definition.requiredBindings).size !== definition.requiredBindings.length) {
    errors.push('Rule module requiredBindings must be unique.');
  }
  return errors;
}

function insertEffects(target: EffectDefinition[], values: EffectDefinition[], placement: string, anchorId?: string): void {
  if (placement === 'prepend') return void target.unshift(...values);
  if (placement === 'append') return void target.push(...values);
  if (!anchorId) throw new Error('after-program placement requires anchorId.');
  const index = target.findIndex((effect) => effect.kind === 'core.rewrite' && effect.programId === anchorId);
  if (index < 0) throw new Error(`Effect anchor program ${anchorId} was not found.`);
  target.splice(index + 1, 0, ...values);
}

function insertRequirements(
  target: RequirementDefinition[],
  values: RequirementDefinition[],
  placement: string,
  anchorId?: string,
): void {
  if (placement === 'prepend') return void target.unshift(...values);
  if (placement === 'append') return void target.push(...values);
  if (!anchorId) throw new Error('after-requirement placement requires anchorId.');
  const index = target.findIndex((requirement) => requirement.id === anchorId);
  if (index < 0) throw new Error(`Requirement anchor ${anchorId} was not found.`);
  target.splice(index + 1, 0, ...values);
}

function requireAction(world: WorldSource, id: string): ActionDefinition {
  const action = world.actions.find((entry) => entry.id === id);
  if (!action) throw new Error(`Rule module references unknown action ${id}.`);
  return action;
}

function requireWindow(world: WorldSource, id: string): ResponseWindowDefinition {
  const window = world.responseWindows?.find((entry) => entry.id === id);
  if (!window) throw new Error(`Rule module references unknown response window ${id}.`);
  return window;
}

function applyPatch(world: WorldSource, patch: RuleModulePatch, context: ModuleEvaluationContext): void {
  if (patch.kind === 'metadata.merge') {
    world.metadata = {
      ...(world.metadata ?? {}),
      ...asObject(resolveModuleValue(patch.value, context), 'metadata.merge value'),
    };
    return;
  }
  if (patch.kind === 'action.effects') {
    const id = resolveModuleValue(patch.actionId, context);
    if (typeof id !== 'string') throw new Error('action.effects actionId must resolve to string.');
    const anchor = patch.anchorId == null ? undefined : resolveModuleValue(patch.anchorId, context);
    insertEffects(
      requireAction(world, id).effects,
      resolveModuleValue(patch.values, context) as EffectDefinition[],
      patch.placement,
      anchor == null ? undefined : String(anchor),
    );
    return;
  }
  if (patch.kind === 'action.requirements') {
    const id = resolveModuleValue(patch.actionId, context);
    if (typeof id !== 'string') throw new Error('action.requirements actionId must resolve to string.');
    const anchor = patch.anchorId == null ? undefined : resolveModuleValue(patch.anchorId, context);
    insertRequirements(
      requireAction(world, id).requirements,
      resolveModuleValue(patch.values, context) as RequirementDefinition[],
      patch.placement,
      anchor == null ? undefined : String(anchor),
    );
    return;
  }
  if (patch.kind === 'response.selection-effects') {
    const windowId = resolveModuleValue(patch.windowId, context);
    const actionId = resolveModuleValue(patch.actionId, context);
    if (typeof windowId !== 'string' || typeof actionId !== 'string') throw new Error('Response patch ids must be strings.');
    const effects = requireWindow(world, windowId).selectionEffects[actionId];
    if (!effects) throw new Error(`Response window ${windowId} has no selection effects for ${actionId}.`);
    const anchor = patch.anchorId == null ? undefined : resolveModuleValue(patch.anchorId, context);
    insertEffects(
      effects,
      resolveModuleValue(patch.values, context) as EffectDefinition[],
      patch.placement,
      anchor == null ? undefined : String(anchor),
    );
    return;
  }
  if (patch.kind === 'response.no-selection-effects') {
    const windowId = resolveModuleValue(patch.windowId, context);
    if (typeof windowId !== 'string') throw new Error('Response patch windowId must be string.');
    const anchor = patch.anchorId == null ? undefined : resolveModuleValue(patch.anchorId, context);
    insertEffects(
      requireWindow(world, windowId).noSelectionEffects,
      resolveModuleValue(patch.values, context) as EffectDefinition[],
      patch.placement,
      anchor == null ? undefined : String(anchor),
    );
    return;
  }
  const procedureId = resolveModuleValue(patch.procedureId, context);
  const nodeId = resolveModuleValue(patch.nodeId, context);
  if (typeof procedureId !== 'string' || typeof nodeId !== 'string') throw new Error('Procedure patch ids must be strings.');
  const procedure = world.procedures.find((entry) => entry.id === procedureId);
  const node = procedure?.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new Error(`Rule module references unknown procedure node ${procedureId}/${nodeId}.`);
  node.onEnter ??= [];
  const anchor = patch.anchorId == null ? undefined : resolveModuleValue(patch.anchorId, context);
  insertEffects(
    node.onEnter,
    resolveModuleValue(patch.values, context) as EffectDefinition[],
    patch.placement,
    anchor == null ? undefined : String(anchor),
  );
}

function appendCorePrograms(world: WorldSource, programs: WorldCorePrograms): void {
  world.corePrograms ??= {};
  world.corePrograms.constraints = [...(world.corePrograms.constraints ?? []), ...(programs.constraints ?? [])];
  world.corePrograms.reducers = [...(world.corePrograms.reducers ?? []), ...(programs.reducers ?? [])];
  world.corePrograms.rewrites = [...(world.corePrograms.rewrites ?? []), ...(programs.rewrites ?? [])];
}

export function instantiateRuleModule(
  base: WorldSource,
  application: RuleModuleApplication,
): RuleModuleInstantiation {
  const { definition } = application;
  const errors = validateRuleModuleDefinition(definition);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const parameters = {
    ...(definition.parameters?.defaults ?? {}),
    ...(application.parameters ?? {}),
  };
  if (definition.parameters) {
    const issues = validateDataAgainstSchema(definition.parameters.schema, parameters);
    if (issues.length > 0) throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }
  const bindings = clone(application.bindings ?? {});
  const world = clone(base);
  world.responseWindows ??= [];
  const context: ModuleEvaluationContext = {
    module: { id: definition.id, version: definition.version, title: definition.title },
    parameters,
    bindings,
    locals: {},
    world,
  };
  for (const binding of definition.requiredBindings ?? []) requireLookup(context, `bindings.${binding}`);

  const additions = definition.additions ?? {};
  world.entities.push(...resolveModuleValue(additions.entities ?? [], context) as WorldSource['entities']);
  world.zones.push(...resolveModuleValue(additions.zones ?? [], context) as WorldSource['zones']);
  world.relations.push(...resolveModuleValue(additions.relations ?? [], context) as WorldSource['relations']);
  world.actions.push(...resolveModuleValue(additions.actions ?? [], context) as WorldSource['actions']);
  world.procedures.push(...resolveModuleValue(additions.procedures ?? [], context) as WorldSource['procedures']);
  world.responseWindows.push(...resolveModuleValue(additions.responseWindows ?? [], context) as ResponseWindowDefinition[]);
  if (additions.corePrograms) appendCorePrograms(world, resolveModuleValue(additions.corePrograms, context) as WorldCorePrograms);
  world.bootstrap.push(...resolveModuleValue(additions.bootstrap ?? [], context) as WorldSource['bootstrap']);
  world.initialEvents = [
    ...(world.initialEvents ?? []),
    ...(resolveModuleValue(additions.initialEvents ?? [], context) as NonNullable<WorldSource['initialEvents']>),
  ];
  if (additions.metadata) world.metadata = { ...(world.metadata ?? {}), ...resolveModuleValue(additions.metadata, context) };
  for (const patch of definition.patches ?? []) applyPatch(world, patch, context);

  const artifacts = resolveModuleValue(definition.artifacts ?? {}, context) as Record<string, unknown>;
  const manifest: RuleModuleManifest = {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    hash: stableHash({ definition, parameters, bindings, artifacts }),
    parameters: clone(parameters),
    bindings: clone(bindings),
    artifactKeys: Object.keys(artifacts).sort(),
  };
  world.metadata = {
    ...(world.metadata ?? {}),
    ruleModules: [
      ...((world.metadata?.ruleModules as RuleModuleManifest[] | undefined) ?? []),
      manifest,
    ],
  };
  return { world, artifacts, manifest };
}

export function composeWorldModules(
  base: WorldSource,
  applications: RuleModuleApplication[],
): RuleModuleInstantiation {
  let world = clone(base);
  const artifacts: Record<string, unknown> = {};
  const manifests: RuleModuleManifest[] = [];
  for (const application of applications) {
    const result = instantiateRuleModule(world, application);
    world = result.world;
    artifacts[application.definition.id] = result.artifacts;
    manifests.push(result.manifest);
  }
  return {
    world,
    artifacts,
    manifest: {
      id: 'composed-world-modules',
      version: '1',
      hash: stableHash(manifests),
      parameters: {},
      bindings: {},
      artifactKeys: Object.keys(artifacts).sort(),
    },
  };
}
