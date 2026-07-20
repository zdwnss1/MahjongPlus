import type {
  AggregateOperator,
  ArithmeticOperator,
  ComparisonOperator,
  CoreExpression,
  CoreFormula,
} from '@mahjongplus/world-calculus';

export type SemanticDomain =
  | 'context'
  | 'event'
  | 'tile'
  | 'entity'
  | 'zone'
  | 'zone-entry'
  | 'relation'
  | 'record'
  | 'token';

export interface SemanticBindingProfile {
  id: string;
  version: string;
  fields: Partial<Record<SemanticDomain, Record<string, string[]>>>;
  eventClasses: Record<string, string[]>;
  eventPayloadFields?: Record<string, string>;
}

export type SemanticCollectionReference =
  | { kind: 'context'; field: string }
  | { kind: 'world'; field: 'entities' | 'zones' | 'relations' }
  | { kind: 'binding'; binding: string; domain: SemanticDomain; field: string }
  | { kind: 'module-parameter'; name: string }
  | { kind: 'module-binding'; name: string }
  | { kind: 'literal'; value: unknown[] };

export type SemanticValueReference =
  | { kind: 'literal'; value: unknown }
  | { kind: 'module-parameter'; name: string }
  | { kind: 'module-binding'; name: string }
  | { kind: 'action-parameter'; name: string }
  | { kind: 'context'; field: string }
  | { kind: 'binding'; binding: string; domain: SemanticDomain; field?: string }
  | {
      kind: 'arithmetic';
      operator: ArithmeticOperator;
      left: SemanticValueReference;
      right: SemanticValueReference;
    }
  | {
      kind: 'aggregate';
      operator: AggregateOperator;
      collection: SemanticCollectionReference;
      bind: string;
      domain: SemanticDomain;
      where?: SemanticCondition;
      value?: SemanticValueReference;
    };

export interface SemanticQueryBinding {
  name: string;
  domain: SemanticDomain;
  collection: SemanticCollectionReference;
  eventClass?: string;
  where?: SemanticCondition;
  cardinality?: 'any' | 'one';
}

export interface SemanticEventSequenceStep {
  bind: string;
  eventClass: string;
  where?: SemanticCondition;
}

export type SemanticCondition =
  | { kind: 'boolean'; value: boolean }
  | { kind: 'all'; values: SemanticCondition[] }
  | { kind: 'any'; values: SemanticCondition[] }
  | { kind: 'not'; value: SemanticCondition }
  | {
      kind: 'compare';
      operator: ComparisonOperator;
      left: SemanticValueReference;
      right: SemanticValueReference;
    }
  | {
      kind: 'contains';
      collection: SemanticCollectionReference | SemanticValueReference;
      value: SemanticValueReference;
    }
  | {
      kind: 'exists' | 'forall';
      bind: string;
      domain: SemanticDomain;
      collection: SemanticCollectionReference;
      eventClass?: string;
      where?: SemanticCondition;
      cardinality?: 'any' | 'one';
    }
  | {
      kind: 'event-sequence';
      steps: SemanticEventSequenceStep[];
      before?: SemanticValueReference;
    }
  | {
      kind: 'position';
      entity: SemanticValueReference;
      zoneId?: SemanticValueReference;
      zoneKind?: SemanticValueReference;
      state?: SemanticValueReference;
      ordinal?: {
        operator: ComparisonOperator;
        value: SemanticValueReference;
      };
    };

export interface SemanticQueryDefinition {
  bindings?: SemanticQueryBinding[];
  where: SemanticCondition;
}

export interface SemanticCompileEnvironment {
  context: CoreExpression;
}

interface BoundSemanticValue {
  domain: SemanticDomain;
  expression: CoreExpression;
}

type BoundValues = Record<string, BoundSemanticValue>;

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, parts: string[]): CoreExpression => parts.length === 0
  ? target
  : ({ kind: 'path', target, path: parts });
const compare = (
  operator: ComparisonOperator,
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (values: CoreFormula[]): CoreFormula => values.length === 0
  ? ({ kind: 'boolean', value: true })
  : values.length === 1 ? values[0] : ({ kind: 'all', values });

function safeVariable(name: string): string {
  return `semantic_${name.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

function fieldPath(
  profile: SemanticBindingProfile,
  domain: SemanticDomain,
  field: string,
): string[] {
  const value = profile.fields[domain]?.[field];
  if (!value) throw new Error(`Semantic profile ${profile.id} has no ${domain} field ${field}.`);
  return value;
}

function worldCollection(
  field: 'entities' | 'zones' | 'relations',
  profile: SemanticBindingProfile,
  environment: SemanticCompileEnvironment,
): CoreExpression {
  return path(path(environment.context, fieldPath(profile, 'context', 'world')), [field]);
}

export function compileSemanticCollection(
  reference: SemanticCollectionReference,
  profile: SemanticBindingProfile,
  environment: SemanticCompileEnvironment,
  bound: BoundValues = {},
): CoreExpression {
  if (reference.kind === 'literal') return literal(reference.value);
  if (reference.kind === 'module-parameter') {
    return literal({ $module: 'ref', path: `parameters.${reference.name}` });
  }
  if (reference.kind === 'module-binding') {
    return literal({ $module: 'ref', path: `bindings.${reference.name}` });
  }
  if (reference.kind === 'context') {
    return path(environment.context, fieldPath(profile, 'context', reference.field));
  }
  if (reference.kind === 'world') return worldCollection(reference.field, profile, environment);
  const binding = bound[reference.binding];
  if (!binding) throw new Error(`Unknown semantic binding ${reference.binding}.`);
  if (binding.domain !== reference.domain) {
    throw new Error(`Semantic binding ${reference.binding} is ${binding.domain}, not ${reference.domain}.`);
  }
  return path(binding.expression, fieldPath(profile, reference.domain, reference.field));
}

export function compileSemanticValue(
  reference: SemanticValueReference,
  profile: SemanticBindingProfile,
  environment: SemanticCompileEnvironment,
  bound: BoundValues = {},
): CoreExpression {
  if (reference.kind === 'literal') return literal(reference.value);
  if (reference.kind === 'module-parameter') {
    return literal({ $module: 'ref', path: `parameters.${reference.name}` });
  }
  if (reference.kind === 'module-binding') {
    return literal({ $module: 'ref', path: `bindings.${reference.name}` });
  }
  if (reference.kind === 'action-parameter') {
    return path(
      path(environment.context, fieldPath(profile, 'context', 'params')),
      [reference.name],
    );
  }
  if (reference.kind === 'context') {
    return path(environment.context, fieldPath(profile, 'context', reference.field));
  }
  if (reference.kind === 'binding') {
    const binding = bound[reference.binding];
    if (!binding) throw new Error(`Unknown semantic binding ${reference.binding}.`);
    if (binding.domain !== reference.domain) {
      throw new Error(`Semantic binding ${reference.binding} is ${binding.domain}, not ${reference.domain}.`);
    }
    return reference.field
      ? path(binding.expression, fieldPath(profile, reference.domain, reference.field))
      : binding.expression;
  }
  if (reference.kind === 'arithmetic') {
    return {
      kind: 'arithmetic',
      operator: reference.operator,
      left: compileSemanticValue(reference.left, profile, environment, bound),
      right: compileSemanticValue(reference.right, profile, environment, bound),
    };
  }
  const source = compileSemanticCollection(reference.collection, profile, environment, bound);
  const variableName = safeVariable(reference.bind);
  const nested = {
    ...bound,
    [reference.bind]: { domain: reference.domain, expression: variable(variableName) },
  };
  const filtered = reference.where
    ? {
        kind: 'filter' as const,
        source,
        as: variableName,
        where: compileSemanticCondition(reference.where, profile, environment, nested),
      }
    : source;
  return {
    kind: 'aggregate',
    operator: reference.operator,
    source: filtered,
    as: reference.value ? variableName : undefined,
    value: reference.value
      ? compileSemanticValue(reference.value, profile, environment, nested)
      : undefined,
  };
}

function eventClassCondition(
  binding: string,
  eventClass: string | undefined,
  profile: SemanticBindingProfile,
  bound: BoundValues,
): CoreFormula | undefined {
  if (!eventClass) return undefined;
  const eventTypes = profile.eventClasses[eventClass];
  if (!eventTypes?.length) throw new Error(`Semantic profile ${profile.id} has no event class ${eventClass}.`);
  return {
    kind: 'contains',
    collection: literal(eventTypes),
    value: compileSemanticValue(
      { kind: 'binding', binding, domain: 'event', field: 'type' },
      profile,
      { context: literal(null) },
      bound,
    ),
  };
}

function quantifiedCondition(
  quantifier: 'exists' | 'forall',
  bind: string,
  domain: SemanticDomain,
  collection: SemanticCollectionReference,
  eventClass: string | undefined,
  where: SemanticCondition | undefined,
  cardinality: 'any' | 'one' | undefined,
  profile: SemanticBindingProfile,
  environment: SemanticCompileEnvironment,
  bound: BoundValues,
  continuation?: (next: BoundValues) => CoreFormula,
): CoreFormula {
  const source = compileSemanticCollection(collection, profile, environment, bound);
  const variableName = safeVariable(bind);
  const next = {
    ...bound,
    [bind]: { domain, expression: variable(variableName) },
  };
  const itemPredicates = [
    eventClassCondition(bind, eventClass, profile, next),
    where ? compileSemanticCondition(where, profile, environment, next) : undefined,
  ].filter((entry): entry is CoreFormula => Boolean(entry));
  const quantified: CoreFormula = {
    kind: 'quantify',
    quantifier,
    source,
    as: variableName,
    where: all([
      ...itemPredicates,
      continuation ? continuation(next) : undefined,
    ].filter((entry): entry is CoreFormula => Boolean(entry))),
  };
  if (cardinality !== 'one') return quantified;
  const matches: CoreExpression = {
    kind: 'filter',
    source,
    as: variableName,
    where: all(itemPredicates),
  };
  return all([
    compare('eq', { kind: 'aggregate', operator: 'count', source: matches }, literal(1)),
    quantified,
  ]);
}

function compileEventSequence(
  steps: SemanticEventSequenceStep[],
  before: SemanticValueReference | undefined,
  profile: SemanticBindingProfile,
  environment: SemanticCompileEnvironment,
  bound: BoundValues,
): CoreFormula {
  if (steps.length === 0) return { kind: 'boolean', value: true };
  const eventsCollection: SemanticCollectionReference = { kind: 'context', field: 'events' };
  const recurse = (index: number, current: BoundValues): CoreFormula => {
    const step = steps[index];
    const previous = index > 0 ? steps[index - 1] : undefined;
    return quantifiedCondition(
      'exists',
      step.bind,
      'event',
      eventsCollection,
      step.eventClass,
      step.where,
      'any',
      profile,
      environment,
      current,
      (next) => {
        const order: CoreFormula[] = [];
        if (previous) {
          order.push(compare(
            'gt',
            compileSemanticValue({ kind: 'binding', binding: step.bind, domain: 'event', field: 'revision' }, profile, environment, next),
            compileSemanticValue({ kind: 'binding', binding: previous.bind, domain: 'event', field: 'revision' }, profile, environment, next),
          ));
        }
        if (index === steps.length - 1 && before) {
          order.push(compare(
            'lt',
            compileSemanticValue({ kind: 'binding', binding: step.bind, domain: 'event', field: 'revision' }, profile, environment, next),
            compileSemanticValue(before, profile, environment, next),
          ));
        }
        if (index + 1 < steps.length) order.push(recurse(index + 1, next));
        return all(order);
      },
    );
  };
  return recurse(0, bound);
}

export function compileSemanticCondition(
  condition: SemanticCondition,
  profile: SemanticBindingProfile,
  environment: SemanticCompileEnvironment,
  bound: BoundValues = {},
): CoreFormula {
  if (condition.kind === 'boolean') return { kind: 'boolean', value: condition.value };
  if (condition.kind === 'all' || condition.kind === 'any') {
    return {
      kind: condition.kind,
      values: condition.values.map((entry) => compileSemanticCondition(entry, profile, environment, bound)),
    };
  }
  if (condition.kind === 'not') {
    return { kind: 'not', value: compileSemanticCondition(condition.value, profile, environment, bound) };
  }
  if (condition.kind === 'compare') {
    return compare(
      condition.operator,
      compileSemanticValue(condition.left, profile, environment, bound),
      compileSemanticValue(condition.right, profile, environment, bound),
    );
  }
  if (condition.kind === 'contains') {
    const collection = condition.collection.kind === 'world'
      ? compileSemanticCollection(condition.collection as SemanticCollectionReference, profile, environment, bound)
      : compileSemanticValue(condition.collection as SemanticValueReference, profile, environment, bound);
    return {
      kind: 'contains',
      collection,
      value: compileSemanticValue(condition.value, profile, environment, bound),
    };
  }
  if (condition.kind === 'exists' || condition.kind === 'forall') {
    return quantifiedCondition(
      condition.kind,
      condition.bind,
      condition.domain,
      condition.collection,
      condition.eventClass,
      condition.where,
      condition.cardinality,
      profile,
      environment,
      bound,
    );
  }
  if (condition.kind === 'event-sequence') {
    return compileEventSequence(condition.steps, condition.before, profile, environment, bound);
  }

  if (condition.kind !== 'position') {
  throw new Error(`Unsupported semantic condition ${String((condition as { kind?: unknown }).kind)}.`);
}

const zones = worldCollection('zones', profile, environment);
  const zoneName = safeVariable('position-zone');
  const entryName = safeVariable('position-entry');
  const zonePredicates: CoreFormula[] = [];
  if (condition.zoneId) {
    zonePredicates.push(compare(
      'eq',
      path(variable(zoneName), fieldPath(profile, 'zone', 'id')),
      compileSemanticValue(condition.zoneId, profile, environment, bound),
    ));
  }
  if (condition.zoneKind) {
    zonePredicates.push(compare(
      'eq',
      path(variable(zoneName), fieldPath(profile, 'zone', 'kind')),
      compileSemanticValue(condition.zoneKind, profile, environment, bound),
    ));
  }
  const entryPredicates: CoreFormula[] = [compare(
    'eq',
    path(variable(entryName), fieldPath(profile, 'zone-entry', 'entity-id')),
    compileSemanticValue(condition.entity, profile, environment, bound),
  )];
  if (condition.state) {
    entryPredicates.push(compare(
      'eq',
      path(variable(entryName), fieldPath(profile, 'zone-entry', 'state')),
      compileSemanticValue(condition.state, profile, environment, bound),
    ));
  }
  if (condition.ordinal) {
    entryPredicates.push(compare(
      condition.ordinal.operator,
      path(variable(entryName), fieldPath(profile, 'zone-entry', 'ordinal')),
      compileSemanticValue(condition.ordinal.value, profile, environment, bound),
    ));
  }
  return {
    kind: 'quantify',
    quantifier: 'exists',
    source: zones,
    as: zoneName,
    where: all([
      ...zonePredicates,
      {
        kind: 'quantify',
        quantifier: 'exists',
        source: path(variable(zoneName), fieldPath(profile, 'zone', 'entries')),
        as: entryName,
        where: all(entryPredicates),
      },
    ]),
  };
}

export function compileSemanticQuery(
  query: SemanticQueryDefinition,
  profile: SemanticBindingProfile,
  environment: SemanticCompileEnvironment,
): CoreFormula {
  const bindings = query.bindings ?? [];
  const recurse = (index: number, bound: BoundValues): CoreFormula => {
    if (index >= bindings.length) {
      return compileSemanticCondition(query.where, profile, environment, bound);
    }
    const binding = bindings[index];
    return quantifiedCondition(
      'exists',
      binding.name,
      binding.domain,
      binding.collection,
      binding.eventClass,
      binding.where,
      binding.cardinality,
      profile,
      environment,
      bound,
      (next) => recurse(index + 1, next),
    );
  };
  return recurse(0, {});
}

export function createActionSemanticContext(): CoreExpression {
  return {
    kind: 'record',
    fields: {
      actorId: variable('actorId'),
      revision: variable('revision'),
      actionEntityId: variable('actionEntityId'),
      world: variable('world'),
      events: variable('events'),
      reducers: variable('reducers'),
      params: variable('params'),
      token: variable('token'),
    },
  };
}
