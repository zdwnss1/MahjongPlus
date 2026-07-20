import type {
  CoreExpression,
  CoreFormula,
  RewriteProgram,
} from '@mahjongplus/world-calculus';
import type { RuleModuleDefinition } from './ruleModules.js';

export interface RelatedFixedGroupPattern {
  groupType: string;
  patternId: string;
  size: number;
  /** Predicate variables: members, group. */
  predicate: CoreFormula;
}

export interface RelatedFixedGroupInterpretationDefinition {
  id: string;
  version: string;
  title?: string;
  interpretationActionIds: string[];
  profileFixedGroupCounts: Record<string, number>;
  groupEntityKind: string;
  groupOwnerPath: string[];
  groupTypePath: string[];
  membershipRelationType: string;
  patterns: RelatedFixedGroupPattern[];
  trackId?: string;
  shapeRelationType?: string;
}

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const concat = (...sources: CoreExpression[]): CoreExpression => ({ kind: 'concat', sources });
const distinct = (source: CoreExpression): CoreExpression => ({ kind: 'distinct', source });
const aggregate = (operator: 'count' | 'sum' | 'min' | 'max', source: CoreExpression): CoreExpression => ({ kind: 'aggregate', operator, source });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (...values: CoreFormula[]): CoreFormula => ({ kind: 'all', values });
const any = (...values: CoreFormula[]): CoreFormula => ({ kind: 'any', values });
const contains = (collection: CoreExpression, value: CoreExpression): CoreFormula => ({ kind: 'contains', collection, value });
const quantify = (
  quantifier: 'exists' | 'forall',
  source: CoreExpression,
  as: string,
  where: CoreFormula,
): CoreFormula => ({ kind: 'quantify', quantifier, source, as, where });

function substituteExpression(
  expression: CoreExpression,
  replacements: Record<string, CoreExpression>,
  shadowed = new Set<string>(),
): CoreExpression {
  if (expression.kind === 'literal') return structuredClone(expression);
  if (expression.kind === 'variable') {
    return !shadowed.has(expression.name) && replacements[expression.name]
      ? structuredClone(replacements[expression.name])
      : structuredClone(expression);
  }
  if (expression.kind === 'path') return { ...expression, target: substituteExpression(expression.target, replacements, shadowed) };
  if (expression.kind === 'list') return { ...expression, items: expression.items.map((entry) => substituteExpression(entry, replacements, shadowed)) };
  if (expression.kind === 'record') {
    return {
      ...expression,
      fields: Object.fromEntries(Object.entries(expression.fields)
        .map(([key, value]) => [key, substituteExpression(value, replacements, shadowed)])),
    };
  }
  if (expression.kind === 'if') {
    return {
      ...expression,
      condition: substituteFormula(expression.condition, replacements, shadowed),
      then: substituteExpression(expression.then, replacements, shadowed),
      else: substituteExpression(expression.else, replacements, shadowed),
    };
  }
  if (expression.kind === 'arithmetic') {
    return {
      ...expression,
      left: substituteExpression(expression.left, replacements, shadowed),
      right: substituteExpression(expression.right, replacements, shadowed),
    };
  }
  if (expression.kind === 'filter') {
    const nested = new Set(shadowed).add(expression.as);
    return {
      ...expression,
      source: substituteExpression(expression.source, replacements, shadowed),
      where: substituteFormula(expression.where, replacements, nested),
    };
  }
  if (expression.kind === 'map') {
    const nested = new Set(shadowed).add(expression.as);
    return {
      ...expression,
      source: substituteExpression(expression.source, replacements, shadowed),
      select: substituteExpression(expression.select, replacements, nested),
    };
  }
  if (expression.kind === 'concat') return { ...expression, sources: expression.sources.map((entry) => substituteExpression(entry, replacements, shadowed)) };
  if (expression.kind === 'flatten' || expression.kind === 'distinct') return { ...expression, source: substituteExpression(expression.source, replacements, shadowed) };
  return {
    ...expression,
    source: substituteExpression(expression.source, replacements, shadowed),
    value: expression.value ? substituteExpression(expression.value, replacements, shadowed) : undefined,
  };
}

function substituteFormula(
  formula: CoreFormula,
  replacements: Record<string, CoreExpression>,
  shadowed = new Set<string>(),
): CoreFormula {
  if (formula.kind === 'boolean') return structuredClone(formula);
  if (formula.kind === 'not') return { ...formula, value: substituteFormula(formula.value, replacements, shadowed) };
  if (formula.kind === 'all' || formula.kind === 'any') {
    return { ...formula, values: formula.values.map((entry) => substituteFormula(entry, replacements, shadowed)) };
  }
  if (formula.kind === 'compare') {
    return {
      ...formula,
      left: substituteExpression(formula.left, replacements, shadowed),
      right: substituteExpression(formula.right, replacements, shadowed),
    };
  }
  if (formula.kind === 'contains') {
    return {
      ...formula,
      collection: substituteExpression(formula.collection, replacements, shadowed),
      value: substituteExpression(formula.value, replacements, shadowed),
    };
  }
  const nested = new Set(shadowed).add(formula.as);
  return {
    ...formula,
    source: substituteExpression(formula.source, replacements, shadowed),
    where: substituteFormula(formula.where, replacements, nested),
  };
}

export function compileRelatedFixedGroupInterpretationModule(
  definition: RelatedFixedGroupInterpretationDefinition,
): RuleModuleDefinition {
  if (!definition.id || !definition.version) throw new Error('Fixed-group interpretation id and version are required.');
  if (definition.interpretationActionIds.length === 0) throw new Error('Fixed-group interpretation requires action ids.');
  if (definition.patterns.length === 0) throw new Error('Fixed-group interpretation requires patterns.');
  const trackId = definition.trackId ?? `track:fixed-groups:${definition.id}`;
  const constraintId = `${definition.id}.validate`;
  const rewriteId = `${definition.id}.record`;
  const world = variable('world');
  const entities = path(world, 'entities');
  const relations = path(world, 'relations');
  const proposal = path(variable('params'), 'proposal');
  const groups = filter(entities, 'fixedGroup', all(
    compare('eq', path(variable('fixedGroup'), 'kind'), literal(definition.groupEntityKind)),
    compare('eq', path(variable('fixedGroup'), ...definition.groupOwnerPath), variable('actorId')),
  ));
  const profileCounts = Object.entries(definition.profileFixedGroupCounts)
    .map(([profileId, count]) => ({ profileId, count }));
  const selectedProfileCount = path(filter(
    literal(profileCounts),
    'profileCount',
    compare('eq', path(variable('profileCount'), 'profileId'), path(proposal, 'profileId')),
  ), '0', 'count');
  const relationTargets = (group: CoreExpression) => map(filter(
    relations,
    'membership',
    all(
      compare('eq', path(variable('membership'), 'type'), literal(definition.membershipRelationType)),
      compare('eq', path(variable('membership'), 'source', 'id'), path(group, 'id')),
    ),
  ), 'membership', path(variable('membership'), 'target', 'id'));
  const memberEntities = (group: CoreExpression) => filter(
    entities,
    'memberEntity',
    contains(relationTargets(group), path(variable('memberEntity'), 'id')),
  );
  const wrappedMembers = (group: CoreExpression) => map(
    memberEntities(group),
    'memberEntity',
    record({ id: path(variable('memberEntity'), 'id'), attributes: variable('memberEntity') }),
  );
  const fixedGroupValid = quantify('forall', groups, 'fixedGroup', any(
    ...definition.patterns.map((pattern) => all(
      compare('eq', path(variable('fixedGroup'), ...definition.groupTypePath), literal(pattern.groupType)),
      compare('eq', aggregate('count', relationTargets(variable('fixedGroup'))), literal(pattern.size)),
      compare('eq', aggregate('count', distinct(relationTargets(variable('fixedGroup')))), literal(pattern.size)),
      compare('eq', aggregate('count', memberEntities(variable('fixedGroup'))), literal(pattern.size)),
      substituteFormula(pattern.predicate, {
        members: wrappedMembers(variable('fixedGroup')),
        group: variable('fixedGroup'),
      }),
    )),
  ));
  const constraint = {
    id: constraintId,
    variables: [],
    constraints: [all(
      compare('eq', aggregate('count', filter(
        literal(profileCounts),
        'knownProfile',
        compare('eq', path(variable('knownProfile'), 'profileId'), path(proposal, 'profileId')),
      )), literal(1)),
      compare('eq', aggregate('count', groups), selectedProfileCount),
      fixedGroupValid,
    )],
    maxSolutions: 1,
    maxSteps: 150_000,
  };
  const trackIndex = { $module: 'entity-index', id: trackId } as unknown as string;
  const records = path(entities, trackIndex, 'components', 'fixedGroupContexts', 'records');
  const fixedGroupRecords = map(groups, 'fixedGroup', record({
    groupEntityId: path(variable('fixedGroup'), 'id'),
    groupType: path(variable('fixedGroup'), ...definition.groupTypePath),
    itemIds: relationTargets(variable('fixedGroup')),
    patternId: path(filter(
      literal(definition.patterns.map((pattern) => ({ groupType: pattern.groupType, patternId: pattern.patternId }))),
      'patternBinding',
      compare('eq', path(variable('patternBinding'), 'groupType'), path(variable('fixedGroup'), ...definition.groupTypePath)),
    ), '0', 'patternId'),
  }));
  const acceptedRecord = record({
    id: variable('actionEntityId'),
    interpretationActionId: variable('actionEntityId'),
    actorId: variable('actorId'),
    profileId: path(proposal, 'profileId'),
    structureId: path(proposal, 'structureId'),
    closed: compare('eq', aggregate('count', groups), literal(0)) as unknown as CoreExpression,
    fixedGroups: fixedGroupRecords,
  });
  const operations: RewriteProgram['operations'] = [{
    kind: 'set',
    path: ['world', 'entities', trackIndex, 'components', 'fixedGroupContexts', 'records'],
    value: concat(records, list(acceptedRecord)),
  }];
  if (definition.shapeRelationType) {
    operations.push({
      kind: 'set',
      path: ['world', 'relations'],
      value: concat(relations, list(record({
        id: record({ interpretationActionId: variable('actionEntityId'), relationType: literal(definition.shapeRelationType) }),
        type: literal(definition.shapeRelationType),
        source: record({ kind: literal('player'), id: variable('actorId') }),
        target: record({ kind: literal('tile'), id: path(proposal, 'sourceEntityId') }),
        metadata: record({
          interpretationActionId: variable('actionEntityId'),
          profileId: path(proposal, 'profileId'),
          structureId: path(proposal, 'structureId'),
        }),
      }))),
    });
  }
  const rewrite: RewriteProgram = { id: rewriteId, operations };
  return {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    description: 'Validates related fixed groups and records them beside an accepted finite-partition interpretation.',
    additions: {
      entities: [{ id: trackId, kind: 'fact-track', components: { fixedGroupContexts: { records: [] } } }],
      corePrograms: { constraints: [constraint], reducers: [], rewrites: [rewrite] },
    },
    patches: definition.interpretationActionIds.flatMap((actionId) => [
      {
        kind: 'action.requirements' as const,
        actionId,
        placement: 'append' as const,
        values: [{
          id: `${actionId}.fixed-groups`,
          kind: 'core.constraint',
          programId: constraintId,
          message: 'Existing related groups do not match the selected interpretation profile.',
        }],
      },
      {
        kind: 'action.effects' as const,
        actionId,
        placement: 'append' as const,
        values: [{ kind: 'core.rewrite', programId: rewriteId }],
      },
    ]),
    artifacts: { trackId, constraintId, rewriteId },
    metadata: {
      service: 'related-fixed-group-interpretation-context',
      profileFixedGroupCounts: structuredClone(definition.profileFixedGroupCounts),
      groupEntityKind: definition.groupEntityKind,
      membershipRelationType: definition.membershipRelationType,
    },
  };
}
