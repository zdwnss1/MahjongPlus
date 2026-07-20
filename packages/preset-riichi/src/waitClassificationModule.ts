import type { CoreExpression, CoreFormula } from '@mahjongplus/world-calculus';
import type { RuleModuleDefinition } from '@mahjongplus/world-language';

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const concat = (...sources: CoreExpression[]): CoreExpression => ({ kind: 'concat', sources });
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

function compileWaitClassificationModule(
  id: string,
  title: string,
  actionId: string,
  trackId: string,
): RuleModuleDefinition {
  const world = variable('world');
  const entities = path(world, 'entities');
  const proposal = path(variable('params'), 'proposal');
  const sourceId = path(proposal, 'sourceEntityId');
  const sourceGroups = filter(
    path(proposal, 'groups'),
    'sourceGroup',
    contains(path(variable('sourceGroup'), 'itemIds'), sourceId),
  );
  const sourceGroup = path(sourceGroups, '0');
  const sourceEntity = path(filter(
    entities,
    'sourceEntity',
    compare('eq', path(variable('sourceEntity'), 'id'), sourceId),
  ), '0');
  const sourceMembers = filter(
    entities,
    'sourceMember',
    contains(path(sourceGroup, 'itemIds'), path(variable('sourceMember'), 'id')),
  );
  const ranks = map(sourceMembers, 'sourceMember', path(variable('sourceMember'), 'components', 'tile', 'rank'));
  const sourceRank = path(sourceEntity, 'components', 'tile', 'rank');
  const minRank = aggregate('min', ranks);
  const patternId = path(sourceGroup, 'patternId');
  const structureId = path(proposal, 'structureId');
  const sequenceWait = choose(
    compare('eq', sourceRank, { kind: 'arithmetic', operator: 'add', left: minRank, right: literal(1) }),
    literal('closed'),
    choose(
      any(
        all(compare('eq', minRank, literal(1)), compare('eq', sourceRank, literal(3))),
        all(compare('eq', minRank, literal(7)), compare('eq', sourceRank, literal(7))),
      ),
      literal('edge'),
      literal('two-sided'),
    ),
  );
  const classification = choose(
    compare('eq', patternId, literal('group.orphan-pair')),
    literal('thirteen-sided-orphan'),
    choose(
      compare('eq', patternId, literal('group.orphan-singleton')),
      literal('single-orphan'),
      choose(
        compare('eq', patternId, literal('group.pair.same-face')),
        literal('single'),
        choose(
          compare('eq', patternId, literal('group.triplet.same-face')),
          literal('double-pair'),
          choose(
            compare('eq', patternId, literal('group.sequence.same-suit')),
            sequenceWait,
            literal('unclassified'),
          ),
        ),
      ),
    ),
  );
  const constraintId = `${id}.validate`;
  const rewriteId = `${id}.record`;
  const trackIndex = { $module: 'entity-index', id: trackId } as unknown as string;
  const records = path(entities, trackIndex, 'components', 'waitClassifications', 'records');
  return {
    id,
    version: '1.0.0',
    title,
    description: 'Classifies the source entity position inside an accepted partition without granting score or win eligibility.',
    additions: {
      entities: [{ id: trackId, kind: 'fact-track', components: { waitClassifications: { records: [] } } }],
      corePrograms: {
        constraints: [{
          id: constraintId,
          variables: [],
          constraints: [all(
            compare('eq', aggregate('count', sourceGroups), literal(1)),
            compare('eq', aggregate('count', sourceMembers), aggregate('count', path(sourceGroup, 'itemIds'))),
            compare('eq', aggregate('count', filter(
              entities,
              'matchingSource',
              compare('eq', path(variable('matchingSource'), 'id'), sourceId),
            )), literal(1)),
          )],
          maxSolutions: 1,
          maxSteps: 100_000,
        }],
        reducers: [],
        rewrites: [{
          id: rewriteId,
          operations: [{
            kind: 'set',
            path: ['world', 'entities', trackIndex, 'components', 'waitClassifications', 'records'],
            value: concat(records, list(record({
              id: variable('actionEntityId'),
              interpretationActionId: variable('actionEntityId'),
              actorId: variable('actorId'),
              profileId: path(proposal, 'profileId'),
              structureId,
              sourceEntityId: sourceId,
              sourceGroupSlotId: path(sourceGroup, 'slotId'),
              sourcePatternId: patternId,
              classification,
              state: literal('classified'),
            }))),
          }],
        }],
      },
    },
    patches: [
      {
        kind: 'action.requirements',
        actionId,
        placement: 'append',
        values: [{
          id: `${actionId}.wait-classifiable`,
          kind: 'core.constraint',
          programId: constraintId,
          message: 'The source entity cannot be classified inside exactly one accepted group.',
        }],
      },
      {
        kind: 'action.effects',
        actionId,
        placement: 'append',
        values: [{ kind: 'core.rewrite', programId: rewriteId }],
      },
    ],
    artifacts: { trackId, constraintId, rewriteId },
    metadata: {
      service: 'source-group-classification',
      integrationStatus: 'partial',
      interpretationActionId: actionId,
      grantsScore: false,
      grantsWinSettlement: false,
      classifications: ['single', 'double-pair', 'closed', 'edge', 'two-sided', 'single-orphan', 'thirteen-sided-orphan'],
    },
  };
}

export const RIICHI_RESPONSE_WAIT_CLASSIFICATION_MODULE = compileWaitClassificationModule(
  'service.riichi-response-wait-classification',
  'Riichi response source-group wait classification',
  'interpretation.submit-response',
  'track:response-wait-classifications',
);

export const RIICHI_DIRECT_WAIT_CLASSIFICATION_MODULE = compileWaitClassificationModule(
  'service.riichi-direct-wait-classification',
  'Riichi direct source-group wait classification',
  'interpretation.submit-direct',
  'track:direct-wait-classifications',
);

export const RIICHI_WAIT_CLASSIFICATION_MODULES: RuleModuleDefinition[] = [
  RIICHI_RESPONSE_WAIT_CLASSIFICATION_MODULE,
  RIICHI_DIRECT_WAIT_CLASSIFICATION_MODULE,
];
