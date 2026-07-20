import type { CoreExpression, CoreFormula } from '@mahjongplus/world-calculus';
import {
  compileRegisteredContributionEvaluationModule,
  type RegisteredContributionDefinition,
  type RegisteredContributionEvaluationDefinition,
  type RegisteredEligibilityRule,
} from './registeredContributionEvaluation.js';
import type {
  RuleModuleDefinition,
  RuleModuleParameterDefinition,
} from './ruleModules.js';

export interface ExpressionRegisteredContributionDefinition
  extends Omit<RegisteredContributionDefinition, 'value'> {
  value: number | string | CoreExpression;
}

export interface ExpressionRegisteredEligibilityRule
  extends Omit<RegisteredEligibilityRule, 'contributions'> {
  contributions: ExpressionRegisteredContributionDefinition[];
}

export interface ExpressionRegisteredContributionEvaluationDefinition
  extends Omit<RegisteredContributionEvaluationDefinition, 'rules'> {
  rules: ExpressionRegisteredEligibilityRule[];
  parameters?: RuleModuleParameterDefinition;
}

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const concat = (...sources: CoreExpression[]): CoreExpression => ({ kind: 'concat', sources });
const flatten = (source: CoreExpression): CoreExpression => ({ kind: 'flatten', source });
const distinct = (source: CoreExpression): CoreExpression => ({ kind: 'distinct', source });
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

const EXPRESSION_MARKER = '$registeredContributionExpression';

function substitute(
  value: unknown,
  replacements: Record<string, CoreExpression>,
  bound = new Set<string>(),
): unknown {
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

function buildEvaluationContext(
  definition: ExpressionRegisteredContributionEvaluationDefinition,
): CoreExpression {
  const world = variable('world');
  const entities = path(world, 'entities');
  const actorId = variable('actorId');
  const params = variable('params');
  const targetInterpretationId = path(params, 'interpretationActionId');
  const interpretationIndex = { $module: 'entity-index', id: definition.interpretationTrackId } as unknown as string;
  const fixedIndex = { $module: 'entity-index', id: definition.fixedContextTrackId } as unknown as string;
  const waitIndex = { $module: 'entity-index', id: definition.waitTrackId } as unknown as string;

  const interpretationMatches = filter(
    path(entities, interpretationIndex, 'components', 'interpretations', 'records'),
    'interpretation',
    all(
      compare('eq', path(variable('interpretation'), 'id'), targetInterpretationId),
      compare('eq', path(variable('interpretation'), 'actorId'), actorId),
    ),
  );
  const interpretation = path(interpretationMatches, '0');
  const fixedMatches = filter(
    path(entities, fixedIndex, 'components', 'fixedGroupContexts', 'records'),
    'fixedContext',
    all(
      compare('eq', path(variable('fixedContext'), 'interpretationActionId'), targetInterpretationId),
      compare('eq', path(variable('fixedContext'), 'actorId'), actorId),
    ),
  );
  const fixedContext = path(fixedMatches, '0');
  const waitMatches = filter(
    path(entities, waitIndex, 'components', 'waitClassifications', 'records'),
    'waitContext',
    all(
      compare('eq', path(variable('waitContext'), 'interpretationActionId'), targetInterpretationId),
      compare('eq', path(variable('waitContext'), 'actorId'), actorId),
    ),
  );
  const waitContext = path(waitMatches, '0');
  const concealedItems = path(interpretation, 'items');
  const fixedItemIds = distinct(flatten(map(
    path(fixedContext, 'fixedGroups'),
    'fixedGroup',
    path(variable('fixedGroup'), 'itemIds'),
  )));
  const fixedEntities = filter(
    entities,
    'fixedTileEntity',
    contains(fixedItemIds, path(variable('fixedTileEntity'), 'id')),
  );
  const fixedItems = map(fixedEntities, 'fixedTileEntity', record({
    id: path(variable('fixedTileEntity'), 'id'),
    attributes: variable('fixedTileEntity'),
  }));
  const allItems = concat(concealedItems, fixedItems);
  const allTiles = map(allItems, 'item', record({
    id: path(variable('item'), 'id'),
    face: path(variable('item'), 'attributes', 'components', 'tile', 'baseFace'),
    suit: path(variable('item'), 'attributes', 'components', 'tile', 'suit'),
    rank: path(variable('item'), 'attributes', 'components', 'tile', 'rank'),
    numeric: choose(
      contains(literal(['m', 'p', 's']), path(variable('item'), 'attributes', 'components', 'tile', 'suit')),
      literal(true),
      literal(false),
    ),
    terminalOrHonor: choose(
      any(
        compare('eq', path(variable('item'), 'attributes', 'components', 'tile', 'suit'), literal('z')),
        compare('eq', path(variable('item'), 'attributes', 'components', 'tile', 'rank'), literal(1)),
        compare('eq', path(variable('item'), 'attributes', 'components', 'tile', 'rank'), literal(9)),
      ),
      literal(true),
      literal(false),
    ),
    entity: path(variable('item'), 'attributes'),
  }));

  return record({
    actorId,
    interpretationActionId: targetInterpretationId,
    evaluationActionId: variable('actionEntityId'),
    interpretation,
    profileId: path(interpretation, 'profileId'),
    structureId: path(interpretation, 'structureId'),
    source: path(interpretation, 'source'),
    sourceEntityId: path(interpretation, 'source', 'sourceEntityId'),
    closed: path(fixedContext, 'closed'),
    fixedGroups: path(fixedContext, 'fixedGroups'),
    wait: path(waitContext, 'classification'),
    concealedItems,
    allItems,
    tiles: allTiles,
    events: variable('events'),
    reducers: variable('reducers'),
  });
}

function materializeExpressions(value: unknown, context: CoreExpression): unknown {
  if (Array.isArray(value)) return value.map((entry) => materializeExpressions(entry, context));
  if (!value || typeof value !== 'object') return value;
  const entry = value as Record<string, unknown>;
  if (entry.kind === 'literal') {
    const marker = entry.value;
    if (marker && typeof marker === 'object' && !Array.isArray(marker)) {
      const expression = (marker as Record<string, unknown>)[EXPRESSION_MARKER];
      if (expression && typeof expression === 'object') {
        return substitute(expression, { context });
      }
    }
  }
  return Object.fromEntries(Object.entries(entry).map(([key, child]) => [
    key,
    materializeExpressions(child, context),
  ]));
}

/**
 * Extends the registered-contribution compiler with expression-valued contribution amounts.
 * The resulting module still contains only closed-calculus data; this wrapper does not add a
 * runtime callback or a new evaluator node.
 */
export function compileExpressionRegisteredContributionEvaluationModule(
  definition: ExpressionRegisteredContributionEvaluationDefinition,
): RuleModuleDefinition {
  const markedRules: RegisteredEligibilityRule[] = definition.rules.map((rule) => ({
    ...structuredClone(rule),
    contributions: rule.contributions.map((contribution) => ({
      ...structuredClone(contribution),
      value: typeof contribution.value === 'object'
        ? ({ [EXPRESSION_MARKER]: structuredClone(contribution.value) } as unknown as number)
        : contribution.value,
    })),
  })) as RegisteredEligibilityRule[];

  const compiled = compileRegisteredContributionEvaluationModule({
    ...definition,
    rules: markedRules,
  });
  const materialized = materializeExpressions(
    compiled,
    buildEvaluationContext(definition),
  ) as RuleModuleDefinition;
  materialized.parameters = structuredClone(definition.parameters);
  materialized.metadata = {
    ...(materialized.metadata ?? {}),
    expressionValuedContributions: true,
  };
  return materialized;
}
