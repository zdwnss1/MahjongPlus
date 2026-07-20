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
const choose = (condition: CoreFormula, thenValue: CoreExpression, elseValue: CoreExpression): CoreExpression => ({
  kind: 'if', condition, then: thenValue, else: elseValue,
});
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

function substitute(value: unknown, replacements: Record<string, CoreExpression>, bound = new Set<string>()): unknown {
  if (Array.isArray(value)) return value.map((entry) => substitute(entry, replacements, bound));
  if (!value || typeof value !== 'object') return value;
  const entry = value as Record<string, unknown>;
  if (entry.kind === 'variable' && typeof entry.name === 'string' && !bound.has(entry.name) && replacements[entry.name]) {
    return structuredClone(replacements[entry.name]);
  }
  let nested = bound;
  if ((entry.kind === 'filter' || entry.kind === 'map' || entry.kind === 'quantify') && typeof entry.as === 'string') {
    nested = new Set(bound).add(entry.as);
  }
  return Object.fromEntries(Object.entries(entry).map(([key, child]) => [
    key,
    substitute(child, replacements, key === 'source' ? bound : nested),
  ]));
}

const substituteFormula = (
  formula: CoreFormula,
  replacements: Record<string, CoreExpression>,
): CoreFormula => substitute(formula, replacements) as CoreFormula;

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
    closed: choose(
      compare('eq', aggregate('count', groups), literal(0)),
      literal(true),
      literal(false),
    ),
    fixedGroups: fixedGroupRecords,
  });
  const rewrite: RewriteProgram = {
    id: rewriteId,
    operations: [{
      kind: 'set',
      path: ['world', 'entities', trackIndex, 'components', 'fixedGroupContexts', 'records'],
      value: concat(records, list(acceptedRecord)),
    }],
  };
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
        values: [
          { kind: 'core.rewrite', programId: rewriteId },
          ...(definition.shapeRelationType ? [{
            kind: 'relation.connect',
            relationType: definition.shapeRelationType,
            source: { kind: 'actor' },
            target: {
              kind: 'entity',
              entityKind: 'tile',
              id: { kind: 'context', path: 'params.proposal.sourceEntityId' },
            },
          }] : []),
        ],
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
