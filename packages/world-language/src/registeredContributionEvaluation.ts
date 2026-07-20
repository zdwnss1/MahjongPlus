import type {
  CoreExpression,
  CoreFormula,
  RewriteProgram,
} from '@mahjongplus/world-calculus';
import type { RuleModuleDefinition } from './ruleModules.js';

export interface RegisteredContributionDefinition {
  dimension: string;
  operation: 'add' | 'set';
  value: number | string;
  stage: string;
}

export interface RegisteredEligibilityRule {
  id: string;
  title?: string;
  /** Predicate variable: context. */
  predicate: CoreFormula;
  contributions: RegisteredContributionDefinition[];
  qualification: {
    amount: number;
    stage: string;
  };
}

export interface RegisteredContributionEvaluationDefinition {
  id: string;
  version: string;
  title?: string;
  interpretationTrackId: string;
  fixedContextTrackId: string;
  waitTrackId: string;
  rules: RegisteredEligibilityRule[];
  stageOrder: string[];
  qualificationStage: string;
  minimumQualification: number;
  contributionTrackId?: string;
  qualificationTrackId?: string;
  evaluationActionId?: string;
  qualificationActionId?: string;
  shapeRelationTypes?: string[];
  qualifiedRelationType?: string;
  evaluatedEventType?: string;
  qualifiedEventType?: string;
}

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const concat = (...sources: CoreExpression[]): CoreExpression => ({ kind: 'concat', sources });
const flatten = (source: CoreExpression): CoreExpression => ({ kind: 'flatten', source });
const distinct = (source: CoreExpression): CoreExpression => ({ kind: 'distinct', source });
const aggregate = (
  operator: 'count' | 'sum' | 'min' | 'max',
  source: CoreExpression,
  as?: string,
  value?: CoreExpression,
): CoreExpression => ({ kind: 'aggregate', operator, source, as, value });
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

function requireUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

export function compileRegisteredContributionEvaluationModule(
  definition: RegisteredContributionEvaluationDefinition,
): RuleModuleDefinition {
  if (!definition.id || !definition.version) throw new Error('Registered evaluation id and version are required.');
  if (definition.rules.length === 0) throw new Error('Registered evaluation requires rules.');
  if (definition.stageOrder.length === 0) throw new Error('Registered evaluation requires an ordered stage list.');
  requireUnique(definition.rules.map((entry) => entry.id), 'Registered evaluation rule ids');
  requireUnique(definition.stageOrder, 'Registered evaluation stages');
  if (!definition.stageOrder.includes(definition.qualificationStage)) {
    throw new Error('Qualification stage must occur in the stage order.');
  }
  for (const rule of definition.rules) {
    if (rule.contributions.length === 0) throw new Error(`Registered rule ${rule.id} requires contributions.`);
    for (const contribution of rule.contributions) {
      if (!definition.stageOrder.includes(contribution.stage)) {
        throw new Error(`Registered contribution ${rule.id}/${contribution.dimension} uses an unknown stage.`);
      }
    }
    if (!definition.stageOrder.includes(rule.qualification.stage)) {
      throw new Error(`Registered rule ${rule.id} qualification uses an unknown stage.`);
    }
  }

  const contributionTrackId = definition.contributionTrackId ?? `track:registered-contributions:${definition.id}`;
  const qualificationTrackId = definition.qualificationTrackId ?? `track:registered-qualification:${definition.id}`;
  const evaluationActionId = definition.evaluationActionId ?? `${definition.id}.evaluate`;
  const qualificationActionId = definition.qualificationActionId ?? `${definition.id}.qualify`;
  const qualifiedRelationType = definition.qualifiedRelationType ?? 'can-win-on';
  const shapeRelationTypes = definition.shapeRelationTypes ?? ['has-hand-shape'];
  const evaluationConstraintId = `${definition.id}.evaluation-ready`;
  const evaluationRewriteId = `${definition.id}.evaluate-records`;
  const qualificationConstraintId = `${definition.id}.qualification-valid`;

  const world = variable('world');
  const entities = path(world, 'entities');
  const relations = path(world, 'relations');
  const events = variable('events');
  const reducers = variable('reducers');
  const actorId = variable('actorId');
  const currentActionId = variable('actionEntityId');
  const params = variable('params');
  const targetInterpretationId = path(params, 'interpretationActionId');
  const requestedSourceId = path(params, 'sourceEntityId');
  const interpretationIndex = { $module: 'entity-index', id: definition.interpretationTrackId } as unknown as string;
  const fixedIndex = { $module: 'entity-index', id: definition.fixedContextTrackId } as unknown as string;
  const waitIndex = { $module: 'entity-index', id: definition.waitTrackId } as unknown as string;
  const contributionIndex = { $module: 'entity-index', id: contributionTrackId } as unknown as string;
  const qualificationIndex = { $module: 'entity-index', id: qualificationTrackId } as unknown as string;

  const interpretationRecords = path(entities, interpretationIndex, 'components', 'interpretations', 'records');
  const interpretationMatches = filter(
    interpretationRecords,
    'interpretation',
    all(
      compare('eq', path(variable('interpretation'), 'id'), targetInterpretationId),
      compare('eq', path(variable('interpretation'), 'actorId'), actorId),
    ),
  );
  const interpretation = path(interpretationMatches, '0');
  const fixedRecords = path(entities, fixedIndex, 'components', 'fixedGroupContexts', 'records');
  const fixedMatches = filter(
    fixedRecords,
    'fixedContext',
    all(
      compare('eq', path(variable('fixedContext'), 'interpretationActionId'), targetInterpretationId),
      compare('eq', path(variable('fixedContext'), 'actorId'), actorId),
    ),
  );
  const fixedContext = path(fixedMatches, '0');
  const waitRecords = path(entities, waitIndex, 'components', 'waitClassifications', 'records');
  const waitMatches = filter(
    waitRecords,
    'waitContext',
    all(
      compare('eq', path(variable('waitContext'), 'interpretationActionId'), targetInterpretationId),
      compare('eq', path(variable('waitContext'), 'actorId'), actorId),
    ),
  );
  const waitContext = path(waitMatches, '0');
  const qualificationRecords = path(entities, qualificationIndex, 'components', 'qualifications', 'records');
  const existingEvaluation = filter(
    qualificationRecords,
    'existingQualification',
    compare('eq', path(variable('existingQualification'), 'interpretationActionId'), targetInterpretationId),
  );
  const evaluationConstraint = {
    id: evaluationConstraintId,
    variables: [],
    constraints: [all(
      compare('eq', aggregate('count', interpretationMatches), literal(1)),
      compare('eq', aggregate('count', fixedMatches), literal(1)),
      compare('eq', aggregate('count', waitMatches), literal(1)),
      compare('eq', aggregate('count', existingEvaluation), literal(0)),
    )],
    maxSolutions: 1,
    maxSteps: 100_000,
  };

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
  const context = record({
    actorId,
    interpretationActionId: targetInterpretationId,
    evaluationActionId: currentActionId,
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
    events,
    reducers,
  });

  const ruleContributionLists = definition.rules.map((rule) => {
    const matched = substituteFormula(rule.predicate, { context });
    const records = [
      ...rule.contributions.map((contribution, ordinal) => record({
        interpretationActionId: targetInterpretationId,
        evaluationActionId: currentActionId,
        actorId,
        ruleId: literal(rule.id),
        ruleTitle: literal(rule.title ?? rule.id),
        ordinal: literal(ordinal),
        dimension: literal(contribution.dimension),
        operation: literal(contribution.operation),
        value: literal(contribution.value),
        stage: literal(contribution.stage),
        state: literal('proposed'),
      })),
      record({
        interpretationActionId: targetInterpretationId,
        evaluationActionId: currentActionId,
        actorId,
        ruleId: literal(rule.id),
        ruleTitle: literal(rule.title ?? rule.id),
        ordinal: literal(rule.contributions.length),
        dimension: literal('qualification'),
        operation: literal('add'),
        value: literal(rule.qualification.amount),
        stage: literal(rule.qualification.stage),
        state: literal('proposed'),
      }),
    ];
    return choose(matched, list(...records), list());
  });
  const contributionRecords = path(entities, contributionIndex, 'components', 'contributions', 'records');
  const newContributions = concat(...ruleContributionLists);
  const updatedContributions = concat(contributionRecords, newContributions);
  const qualificationStages = definition.stageOrder.slice(
    0,
    definition.stageOrder.indexOf(definition.qualificationStage) + 1,
  );
  const currentQualificationContributions = filter(
    updatedContributions,
    'qualificationContribution',
    all(
      compare('eq', path(variable('qualificationContribution'), 'interpretationActionId'), targetInterpretationId),
      compare('eq', path(variable('qualificationContribution'), 'dimension'), literal('qualification')),
      compare('eq', path(variable('qualificationContribution'), 'operation'), literal('add')),
      contains(literal(qualificationStages), path(variable('qualificationContribution'), 'stage')),
    ),
  );
  const qualificationTotal = aggregate(
    'sum',
    currentQualificationContributions,
    'qualificationContribution',
    path(variable('qualificationContribution'), 'value'),
  );
  const qualifies = compare('gte', qualificationTotal, literal(definition.minimumQualification));
  const qualificationRecord = record({
    interpretationActionId: targetInterpretationId,
    evaluationActionId: currentActionId,
    actorId,
    sourceEntityId: path(interpretation, 'source', 'sourceEntityId'),
    sourceMode: path(interpretation, 'source', 'mode'),
    total: qualificationTotal,
    minimum: literal(definition.minimumQualification),
    stage: literal(definition.qualificationStage),
    qualifies: choose(qualifies, literal(true), literal(false)),
    state: literal('evaluated'),
  });
  const evaluationRewrite: RewriteProgram = {
    id: evaluationRewriteId,
    operations: [
      {
        kind: 'set',
        path: ['world', 'entities', contributionIndex, 'components', 'contributions', 'records'],
        value: updatedContributions,
      },
      {
        kind: 'set',
        path: ['world', 'entities', qualificationIndex, 'components', 'qualifications', 'records'],
        value: concat(qualificationRecords, list(qualificationRecord)),
      },
    ],
  };

  const requestedInterpretationId = path(params, 'interpretationActionId');
  const requestedSourceId = path(params, 'sourceEntityId');
  const qualificationMatches = filter(
    path(entities, qualificationIndex, 'components', 'qualifications', 'records'),
    'qualification',
    all(
      compare('eq', path(variable('qualification'), 'interpretationActionId'), requestedInterpretationId),
      compare('eq', path(variable('qualification'), 'actorId'), actorId),
      compare('eq', path(variable('qualification'), 'sourceEntityId'), requestedSourceId),
      compare('eq', path(variable('qualification'), 'qualifies'), literal(true)),
    ),
  );
  const shapeMatches = filter(
    relations,
    'shapeRelation',
    all(
      contains(literal(shapeRelationTypes), path(variable('shapeRelation'), 'type')),
      compare('eq', path(variable('shapeRelation'), 'source', 'kind'), literal('player')),
      compare('eq', path(variable('shapeRelation'), 'source', 'id'), actorId),
      compare('eq', path(variable('shapeRelation'), 'target', 'kind'), literal('tile')),
      compare('eq', path(variable('shapeRelation'), 'target', 'id'), requestedSourceId),
    ),
  );
  const existingQualified = filter(
    relations,
    'qualifiedRelation',
    all(
      compare('eq', path(variable('qualifiedRelation'), 'type'), literal(qualifiedRelationType)),
      compare('eq', path(variable('qualifiedRelation'), 'source', 'kind'), literal('player')),
      compare('eq', path(variable('qualifiedRelation'), 'source', 'id'), actorId),
      compare('eq', path(variable('qualifiedRelation'), 'target', 'kind'), literal('tile')),
      compare('eq', path(variable('qualifiedRelation'), 'target', 'id'), requestedSourceId),
    ),
  );
  const qualificationConstraint = {
    id: qualificationConstraintId,
    variables: [],
    constraints: [all(
      compare('eq', aggregate('count', qualificationMatches), literal(1)),
      compare('gte', aggregate('count', shapeMatches), literal(1)),
      compare('eq', aggregate('count', existingQualified), literal(0)),
    )],
    maxSolutions: 1,
    maxSteps: 100_000,
  };

  const evaluationParameters = {
    interpretationActionId: { type: 'string' as const, minLength: 1 },
  };
  const qualificationParameters = {
    interpretationActionId: { type: 'string' as const, minLength: 1 },
    sourceEntityId: { type: 'string' as const, minLength: 1 },
  };
  return {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    description: 'Evaluates registered rules against an accepted physical interpretation, then separately gates win qualification by stage-ordered signed contributions.',
    additions: {
      entities: [
        { id: contributionTrackId, kind: 'fact-track', components: { contributions: { records: [] } } },
        { id: qualificationTrackId, kind: 'fact-track', components: { qualifications: { records: [] } } },
      ],
      actions: [
        {
          id: evaluationActionId,
          parameters: { interpretationActionId: 'string' },
          inputSchema: {
            type: 'object',
            properties: evaluationParameters,
            required: ['interpretationActionId'],
            additionalProperties: false,
          },
          requirements: [
            { id: `${evaluationActionId}.interpretation`, kind: 'parameter-present', parameter: 'interpretationActionId', message: 'An interpretation action id is required.' },
            { id: `${evaluationActionId}.ready`, kind: 'core.constraint', programId: evaluationConstraintId, message: 'The accepted interpretation is missing required fixed-group or wait facts, or was already evaluated.' },
          ],
          effects: [
            { kind: 'core.rewrite', programId: evaluationRewriteId },
            {
              kind: 'event.emit',
              eventType: definition.evaluatedEventType ?? 'registered-evaluation.evaluated',
              subjects: [{ kind: 'actor' }],
              payload: {
                interpretationActionId: { kind: 'context', path: 'params.interpretationActionId' },
                evaluationModuleId: definition.id,
              },
            },
          ],
        },
        {
          id: qualificationActionId,
          parameters: { interpretationActionId: 'string', sourceEntityId: 'string' },
          inputSchema: {
            type: 'object',
            properties: qualificationParameters,
            required: ['interpretationActionId', 'sourceEntityId'],
            additionalProperties: false,
          },
          requirements: [
            { id: `${qualificationActionId}.interpretation`, kind: 'parameter-present', parameter: 'interpretationActionId', message: 'An interpretation action id is required.' },
            { id: `${qualificationActionId}.source`, kind: 'parameter-present', parameter: 'sourceEntityId', message: 'A physical source entity id is required.' },
            { id: `${qualificationActionId}.valid`, kind: 'core.constraint', programId: qualificationConstraintId, message: 'The accepted shape does not meet the registered minimum-yaku qualification.' },
          ],
          effects: [
            {
              kind: 'relation.connect',
              relationType: qualifiedRelationType,
              source: { kind: 'actor' },
              target: {
                kind: 'entity',
                entityKind: 'tile',
                id: { kind: 'context', path: 'params.sourceEntityId' },
              },
              metadata: {
                interpretationActionId: { kind: 'context', path: 'params.interpretationActionId' },
                evaluationModuleId: definition.id,
              },
            },
            {
              kind: 'event.emit',
              eventType: definition.qualifiedEventType ?? 'registered-evaluation.qualified',
              subjects: [{ kind: 'actor' }],
              objects: [{
                kind: 'entity',
                entityKind: 'tile',
                id: { kind: 'context', path: 'params.sourceEntityId' },
              }],
              payload: {
                interpretationActionId: { kind: 'context', path: 'params.interpretationActionId' },
                evaluationModuleId: definition.id,
              },
            },
          ],
        },
      ],
      corePrograms: {
        constraints: [evaluationConstraint, qualificationConstraint],
        reducers: [],
        rewrites: [evaluationRewrite],
      },
    },
    artifacts: {
      contributionTrackId,
      qualificationTrackId,
      evaluationActionId,
      qualificationActionId,
      evaluationConstraintId,
      evaluationRewriteId,
      qualificationConstraintId,
      registeredRuleIds: definition.rules.map((entry) => entry.id),
    },
    metadata: {
      service: 'registered-contribution-evaluation',
      stageOrder: structuredClone(definition.stageOrder),
      qualificationStage: definition.qualificationStage,
      minimumQualification: definition.minimumQualification,
      qualifiedRelationType,
      shapeRelationTypes,
    },
  };
}
