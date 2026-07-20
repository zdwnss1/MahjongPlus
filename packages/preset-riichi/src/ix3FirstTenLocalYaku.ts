import type { CoreExpression, CoreFormula } from '@mahjongplus/world-calculus';
import {
  compileExpressionRegisteredContributionEvaluationModule,
  type ExpressionRegisteredEligibilityRule,
  type RuleModuleDefinition,
} from '@mahjongplus/world-language';

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const aggregate = (
  operator: 'count' | 'sum' | 'min' | 'max',
  source: CoreExpression,
  as?: string,
  value?: CoreExpression,
): CoreExpression => ({ kind: 'aggregate', operator, source, as, value });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (...values: CoreFormula[]): CoreFormula => ({ kind: 'all', values });
const any = (...values: CoreFormula[]): CoreFormula => ({ kind: 'any', values });
const not = (value: CoreFormula): CoreFormula => ({ kind: 'not', value });
const contains = (collection: CoreExpression, value: CoreExpression): CoreFormula => ({ kind: 'contains', collection, value });
const quantify = (
  quantifier: 'exists' | 'forall',
  source: CoreExpression,
  as: string,
  where: CoreFormula,
): CoreFormula => ({ kind: 'quantify', quantifier, source, as, where });
const moduleParameter = (name: string): CoreExpression => literal({ $module: 'ref', path: `parameters.${name}` });

const context = variable('context');
const events = path(context, 'events');
const tiles = path(context, 'tiles');
const source = path(context, 'source');
const sourceEvent = path(filter(
  events,
  'sourceEvent',
  compare('eq', path(variable('sourceEvent'), 'id'), path(source, 'exposureId')),
), '0');

const declarationBeforeSource = (declarationType: string): CoreFormula => quantify(
  'exists',
  events,
  'declaration',
  all(
    compare('eq', path(variable('declaration'), 'type'), literal('declaration.published')),
    compare('eq', path(variable('declaration'), 'actorId'), path(context, 'actorId')),
    compare('eq', path(variable('declaration'), 'payload', 'declarationType'), literal(declarationType)),
    compare('lte', path(variable('declaration'), 'revision'), path(sourceEvent, 'revision')),
  ),
);

const anyRiichiDeclarationBeforeSource: CoreFormula = quantify(
  'exists',
  events,
  'declaration',
  all(
    compare('eq', path(variable('declaration'), 'type'), literal('declaration.published')),
    compare('eq', path(variable('declaration'), 'actorId'), path(context, 'actorId')),
    contains(
      literal(['riichi', 'open-riichi', 'super-riichi', 'pon-riichi', 'hochi', 'tsumo-sen', 'bunbun-riichi']),
      path(variable('declaration'), 'payload', 'declarationType'),
    ),
    compare('lt', path(variable('declaration'), 'revision'), path(sourceEvent, 'revision')),
    not(quantify(
      'exists',
      events,
      'interveningCall',
      all(
        compare('eq', path(variable('interveningCall'), 'type'), literal('meld.committed')),
        compare('gt', path(variable('interveningCall'), 'revision'), path(variable('declaration'), 'revision')),
        compare('lt', path(variable('interveningCall'), 'revision'), path(sourceEvent, 'revision')),
      ),
    )),
    not(quantify(
      'exists',
      events,
      'earlierOwnDraw',
      all(
        compare('eq', path(variable('earlierOwnDraw'), 'type'), literal('tile.drawn')),
        compare('eq', path(variable('earlierOwnDraw'), 'actorId'), path(context, 'actorId')),
        compare('gt', path(variable('earlierOwnDraw'), 'revision'), path(variable('declaration'), 'revision')),
        compare('lt', path(variable('earlierOwnDraw'), 'revision'), path(sourceEvent, 'revision')),
      ),
    )),
  ),
);

const sourceTileHasFace = (faces: CoreExpression): CoreFormula => quantify(
  'exists',
  tiles,
  'sourceTile',
  all(
    compare('eq', path(variable('sourceTile'), 'id'), path(context, 'sourceEntityId')),
    contains(faces, path(variable('sourceTile'), 'face')),
  ),
);

const designatedTiles = filter(
  tiles,
  'designatedTile',
  contains(moduleParameter('specialDoraFaces'), path(variable('designatedTile'), 'face')),
);

const orderedPonChiKanBeforeSource: CoreFormula = quantify(
  'exists',
  events,
  'ponEvent',
  all(
    compare('eq', path(variable('ponEvent'), 'type'), literal('meld.committed')),
    compare('eq', path(variable('ponEvent'), 'actorId'), path(context, 'actorId')),
    compare('eq', path(variable('ponEvent'), 'payload', 'callType'), literal('pon')),
    quantify(
      'exists',
      events,
      'chiEvent',
      all(
        compare('eq', path(variable('chiEvent'), 'type'), literal('meld.committed')),
        compare('eq', path(variable('chiEvent'), 'actorId'), path(context, 'actorId')),
        compare('eq', path(variable('chiEvent'), 'payload', 'callType'), literal('chi')),
        compare('gt', path(variable('chiEvent'), 'revision'), path(variable('ponEvent'), 'revision')),
        quantify(
          'exists',
          events,
          'kanEvent',
          all(
            compare('eq', path(variable('kanEvent'), 'type'), literal('meld.committed')),
            compare('eq', path(variable('kanEvent'), 'actorId'), path(context, 'actorId')),
            compare('eq', path(variable('kanEvent'), 'payload', 'callType'), literal('open-kan')),
            compare('gt', path(variable('kanEvent'), 'revision'), path(variable('chiEvent'), 'revision')),
            compare('lt', path(variable('kanEvent'), 'revision'), path(sourceEvent, 'revision')),
          ),
        ),
      ),
    ),
  ),
);

const declaredRule = (type: string, han: number): ExpressionRegisteredEligibilityRule => ({
  id: `local.${type}`,
  title: type,
  predicate: declarationBeforeSource(type),
  contributions: [{ dimension: 'han', operation: 'add', value: han, stage: 'base-yaku' }],
  qualification: { amount: 1, stage: 'base-yaku' },
});

export const IX3_FIRST_TEN_REGISTERED_RULES: ExpressionRegisteredEligibilityRule[] = [
  {
    id: 'local.special-dora',
    title: '特殊ドラ（見立てドラ）',
    predicate: { kind: 'boolean', value: true },
    contributions: [{
      dimension: 'han',
      operation: 'add',
      value: aggregate('count', designatedTiles),
      stage: 'tile-effects',
    }],
    qualification: { amount: 0, stage: 'tile-effects' },
  },
  declaredRule('pon-riichi', 1),
  declaredRule('hochi', 2),
  declaredRule('tsumo-sen', 2),
  declaredRule('bunbun-riichi', 3),
  {
    id: 'local.tsubame-gaeshi',
    title: '燕返し',
    predicate: all(
      compare('eq', path(source, 'mode'), literal('response')),
      quantify(
        'exists',
        events,
        'declaration',
        all(
          compare('eq', path(variable('declaration'), 'type'), literal('declaration.published')),
          compare('neq', path(variable('declaration'), 'actorId'), path(context, 'actorId')),
          contains(
            literal(['riichi', 'open-riichi', 'super-riichi', 'pon-riichi', 'hochi', 'tsumo-sen', 'bunbun-riichi']),
            path(variable('declaration'), 'payload', 'declarationType'),
          ),
          any(
            compare(
              'eq',
              path(variable('declaration'), 'causedByActionId'),
              path(sourceEvent, 'causedByActionId'),
            ),
            compare(
              'eq',
              path(variable('declaration'), 'payload', 'discardEventId'),
              path(sourceEvent, 'id'),
            ),
          ),
        ),
      ),
    ),
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.kakikomi',
    title: '書込',
    predicate: all(
      compare('eq', path(source, 'mode'), literal('direct')),
      sourceTileHasFace(literal(['z5'])),
      anyRiichiDeclarationBeforeSource,
    ),
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.no-chi-no-pon',
    title: '不吃不ポン',
    predicate: all(
      compare('eq', path(context, 'closed'), literal(true)),
      contains(moduleParameter('noCallCommitmentActorIds'), path(context, 'actorId')),
      not(quantify(
        'exists',
        events,
        'callEvent',
        all(
          compare('eq', path(variable('callEvent'), 'actorId'), path(context, 'actorId')),
          contains(literal(['meld.committed', 'kan.committed']), path(variable('callEvent'), 'type')),
        ),
      )),
    ),
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.pon-chi-kan-ron',
    title: 'ポンチーカンロン',
    predicate: all(
      compare('eq', path(source, 'mode'), literal('response')),
      orderedPonChiKanBeforeSource,
    ),
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.dora-ho',
    title: 'ドラ和',
    predicate: sourceTileHasFace(moduleParameter('activeDoraFaces')),
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
];

const evaluationParameters = {
  schema: {
    type: 'object' as const,
    properties: {
      specialDoraFaces: { type: 'array' as const, items: { type: 'string' as const }, uniqueItems: true },
      activeDoraFaces: { type: 'array' as const, items: { type: 'string' as const }, uniqueItems: true },
      noCallCommitmentActorIds: { type: 'array' as const, items: { type: 'string' as const }, uniqueItems: true },
    },
    required: ['specialDoraFaces', 'activeDoraFaces', 'noCallCommitmentActorIds'],
    additionalProperties: false,
  },
  defaults: {
    specialDoraFaces: [],
    activeDoraFaces: [],
    noCallCommitmentActorIds: [],
  },
};

export const IX3_FIRST_TEN_RESPONSE_EVALUATION_MODULE =
  compileExpressionRegisteredContributionEvaluationModule({
    id: 'service.ix3-first-ten-response-evaluation',
    version: '1.0.0',
    title: 'ix3 local yaku 1–10 response evaluation',
    interpretationTrackId: 'track:hand-interpretations',
    fixedContextTrackId: 'track:fixed-meld-interpretation-contexts',
    waitTrackId: 'track:wait-classifications',
    rules: IX3_FIRST_TEN_REGISTERED_RULES,
    stageOrder: ['base-yaku', 'tile-effects', 'qualification'],
    qualificationStage: 'qualification',
    minimumQualification: 1,
    contributionTrackId: 'track:ix3-first-ten-response-contributions',
    qualificationTrackId: 'track:ix3-first-ten-response-qualifications',
    evaluationActionId: 'evaluation.evaluate-ix3-first-ten-response',
    qualificationActionId: 'evaluation.qualify-ix3-first-ten-response',
    shapeRelationTypes: ['has-hand-shape'],
    qualifiedRelationType: 'can-win-on',
    parameters: evaluationParameters,
  });

export const IX3_FIRST_TEN_DIRECT_EVALUATION_MODULE =
  compileExpressionRegisteredContributionEvaluationModule({
    id: 'service.ix3-first-ten-direct-evaluation',
    version: '1.0.0',
    title: 'ix3 local yaku 1–10 direct evaluation',
    interpretationTrackId: 'track:direct-hand-interpretations',
    fixedContextTrackId: 'track:direct-fixed-meld-contexts',
    waitTrackId: 'track:direct-wait-classifications',
    rules: IX3_FIRST_TEN_REGISTERED_RULES,
    stageOrder: ['base-yaku', 'tile-effects', 'qualification'],
    qualificationStage: 'qualification',
    minimumQualification: 1,
    contributionTrackId: 'track:ix3-first-ten-direct-contributions',
    qualificationTrackId: 'track:ix3-first-ten-direct-qualifications',
    evaluationActionId: 'evaluation.evaluate-ix3-first-ten-direct',
    qualificationActionId: 'evaluation.qualify-ix3-first-ten-direct',
    shapeRelationTypes: ['has-hand-shape'],
    qualifiedRelationType: 'can-win-on',
    parameters: evaluationParameters,
  });

const world = { kind: 'variable', name: 'world' };
const entities = { kind: 'path', target: world, path: ['entities'] };
const eventsExpression = { kind: 'variable', name: 'events' };
const actorId = { kind: 'variable', name: 'actorId' };
const actionEntityId = { kind: 'variable', name: 'actionEntityId' };
const params = { kind: 'variable', name: 'params' };
const ledgerIndex = { $module: 'entity-index', id: { $module: 'ref', path: 'bindings.ledgerId' } };
const declarationIndex = { $module: 'entity-index', id: 'track:ix3-local-declarations' };
const sourcePolicyIndex = { $module: 'entity-index', id: 'track:ix3-win-source-policies' };
const privilegeIndex = { $module: 'entity-index', id: 'track:ix3-declaration-privileges' };
const visibilityIndex = { $module: 'entity-index', id: 'track:ix3-visibility-policies' };
const accounts = { kind: 'path', target: entities, path: [ledgerIndex, 'components', 'ledger', 'accounts'] };
const declarationRecords = { kind: 'path', target: entities, path: [declarationIndex, 'components', 'factTrack', 'records'] };
const sourcePolicies = { kind: 'path', target: entities, path: [sourcePolicyIndex, 'components', 'factTrack', 'records'] };
const actorAccount = {
  kind: 'path',
  target: {
    kind: 'filter', source: accounts, as: 'account',
    where: {
      kind: 'compare', operator: 'eq',
      left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] },
      right: actorId,
    },
  },
  path: ['0'],
};
const existingPublishedDeclarationEvents = {
  kind: 'filter', source: eventsExpression, as: 'event',
  where: {
    kind: 'all', values: [
      { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['type'] }, right: { kind: 'literal', value: 'declaration.published' } },
      { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['actorId'] }, right: actorId },
    ],
  },
};
const latestRevision = { kind: 'aggregate', operator: 'max', source: eventsExpression, as: 'event', value: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['revision'] } };
const recentPonEvents = {
  kind: 'filter', source: eventsExpression, as: 'event',
  where: {
    kind: 'all', values: [
      { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['type'] }, right: { kind: 'literal', value: 'meld.committed' } },
      { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['actorId'] }, right: actorId },
      { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['payload', 'callType'] }, right: { kind: 'literal', value: 'pon' } },
      { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['revision'] }, right: latestRevision },
    ],
  },
};
const player = {
  kind: 'path',
  target: {
    kind: 'filter', source: entities, as: 'entity',
    where: { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'entity' }, path: ['id'] }, right: actorId },
  },
  path: ['0'],
};
const declarationBase = (declarationType: string) => ({
  correlationId: actionEntityId,
  sourceRuleId: { kind: 'literal', value: `local:${declarationType}` },
  actorId,
  declarationType: { kind: 'literal', value: declarationType },
  state: { kind: 'literal', value: 'published' },
  lifetime: { kind: 'literal', value: 'until-hand-end' },
});
const transferAccounts = (amount: unknown) => ({
  kind: 'map', source: accounts, as: 'account',
  select: {
    kind: 'if',
    condition: { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] }, right: actorId },
    then: {
      kind: 'record', fields: {
        id: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] },
        balance: { kind: 'arithmetic', operator: 'subtract', left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['balance'] }, right: { kind: 'literal', value: amount } },
      },
    },
    else: {
      kind: 'if',
      condition: { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] }, right: { kind: 'literal', value: 'riichi-pot' } },
      then: {
        kind: 'record', fields: {
          id: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] },
          balance: { kind: 'arithmetic', operator: 'add', left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['balance'] }, right: { kind: 'literal', value: amount } },
        },
      },
      else: { kind: 'variable', name: 'account' },
    },
  },
});
const commitOperations = (
  declarationType: string,
  stakeParameter: string,
  extras: unknown[] = [],
) => [
  {
    kind: 'set', path: ['world', 'entities', ledgerIndex, 'components', 'ledger', 'accounts'],
    value: transferAccounts({ $module: 'ref', path: `parameters.${stakeParameter}` }),
  },
  {
    kind: 'append', path: ['world', 'entities', declarationIndex, 'components', 'factTrack', 'records'],
    value: { kind: 'record', fields: declarationBase(declarationType) },
  },
  ...extras,
];
const amountConstraint = (id: string, stakeParameter: string, extra: unknown[] = []) => ({
  id,
  variables: [],
  constraints: [{
    kind: 'all', values: [
      { kind: 'compare', operator: 'eq', left: { kind: 'aggregate', operator: 'count', source: existingPublishedDeclarationEvents }, right: { kind: 'literal', value: 0 } },
      { kind: 'compare', operator: 'gte', left: { kind: 'path', target: actorAccount, path: ['balance'] }, right: { kind: 'literal', value: { $module: 'ref', path: `parameters.${stakeParameter}` } } },
      ...extra,
    ],
  }],
  maxSolutions: 1,
  maxSteps: 20_000,
});

export const IX3_FIRST_TEN_DECLARATION_MODULE: RuleModuleDefinition = {
  id: 'rule.ix3-first-ten-declarations',
  version: '1.0.0',
  title: 'ix3 local declaration roles 2–5',
  parameters: {
    schema: {
      type: 'object',
      properties: {
        ponRiichiStake: { type: 'number', integer: true, minimum: 0 },
        hochiFee: { type: 'number', integer: true, minimum: 0 },
        tsumoSenStake: { type: 'number', integer: true, minimum: 0 },
        bunbunStake: { type: 'number', integer: true, minimum: 0 },
      },
      required: ['ponRiichiStake', 'hochiFee', 'tsumoSenStake', 'bunbunStake'],
      additionalProperties: false,
    },
    defaults: { ponRiichiStake: 1000, hochiFee: 3000, tsumoSenStake: 1000, bunbunStake: 1000 },
  },
  requiredBindings: ['ledgerId', 'singleWaitRelationType'],
  additions: {
    entities: [
      { id: 'track:ix3-local-declarations', kind: 'fact-track', components: { factTrack: { factType: 'public-declaration', records: [] } } },
      { id: 'track:ix3-win-source-policies', kind: 'fact-track', components: { factTrack: { factType: 'win-source-policy', records: [] } } },
      { id: 'track:ix3-declaration-privileges', kind: 'fact-track', components: { factTrack: { factType: 'declaration-privilege-policy', records: [] } } },
      { id: 'track:ix3-visibility-policies', kind: 'fact-track', components: { factTrack: { factType: 'visibility-policy', records: [] } } },
    ],
    actions: [
      {
        id: 'declare-pon-riichi', parameters: {},
        requirements: [
          { id: 'declare-pon-riichi.turn', kind: 'procedure-token', procedureId: 'turn', nodeId: 'await-discard', owner: 'actor', message: 'Pon riichi must be declared before the post-pon discard.' },
          { id: 'declare-pon-riichi.eligible', kind: 'core.constraint', programId: 'ix3.pon-riichi.eligible', message: 'The latest committed call is not this player’s pon or a declaration already exists.' },
        ],
        effects: [
          { kind: 'core.rewrite', programId: 'ix3.pon-riichi.commit' },
          { kind: 'event.emit', eventType: 'declaration.published', subjects: [{ kind: 'actor' }], payload: { declarationType: 'pon-riichi' } },
        ],
      },
      {
        id: 'declare-hochi', parameters: { waitEvidenceId: 'string', waitForm: 'string' },
        requirements: [
          { id: 'declare-hochi.wait-evidence', kind: 'parameter-present', parameter: 'waitEvidenceId', message: 'Hochi requires one authoritative wait-evidence id.' },
          { id: 'declare-hochi.wait-form', kind: 'parameter-present', parameter: 'waitForm', message: 'Hochi requires the declared wait form.' },
          { id: 'declare-hochi.single-wait', kind: 'relation-exists', source: { kind: 'actor' }, target: { kind: 'entity', entityKind: 'wait-evidence', id: { kind: 'context', path: 'params.waitEvidenceId' } }, relationType: { $module: 'ref', path: 'bindings.singleWaitRelationType' }, message: 'The supplied evidence does not prove one wait type.' },
          { id: 'declare-hochi.eligible', kind: 'core.constraint', programId: 'ix3.hochi.eligible', message: 'Hochi requires a closed eligible declaration state and sufficient points.' },
        ],
        effects: [
          { kind: 'core.rewrite', programId: 'ix3.hochi.commit' },
          { kind: 'event.emit', eventType: 'declaration.published', subjects: [{ kind: 'actor' }], payload: { declarationType: 'hochi', waitEvidenceId: { kind: 'context', path: 'params.waitEvidenceId' }, waitForm: { kind: 'context', path: 'params.waitForm' } } },
        ],
      },
      {
        id: 'declare-tsumo-sen', parameters: {},
        requirements: [{ id: 'declare-tsumo-sen.eligible', kind: 'core.constraint', programId: 'ix3.tsumo-sen.eligible', message: 'Tsumo-sen requires a closed eligible declaration state and sufficient points.' }],
        effects: [
          { kind: 'core.rewrite', programId: 'ix3.tsumo-sen.commit' },
          { kind: 'event.emit', eventType: 'declaration.published', subjects: [{ kind: 'actor' }], payload: { declarationType: 'tsumo-sen' } },
        ],
      },
      {
        id: 'declare-bunbun-riichi', parameters: {},
        requirements: [{ id: 'declare-bunbun-riichi.eligible', kind: 'core.constraint', programId: 'ix3.bunbun.eligible', message: 'Bunbun riichi requires a closed eligible declaration state and sufficient points.' }],
        effects: [
          { kind: 'core.rewrite', programId: 'ix3.bunbun.commit' },
          { kind: 'event.emit', eventType: 'declaration.published', subjects: [{ kind: 'actor' }], payload: { declarationType: 'bunbun-riichi' } },
        ],
      },
    ],
    corePrograms: {
      constraints: [
        amountConstraint('ix3.pon-riichi.eligible', 'ponRiichiStake', [
          { kind: 'compare', operator: 'gte', left: { kind: 'aggregate', operator: 'count', source: recentPonEvents }, right: { kind: 'literal', value: 1 } },
        ]),
        amountConstraint('ix3.hochi.eligible', 'hochiFee', [
          { kind: 'compare', operator: 'eq', left: { kind: 'path', target: player, path: ['components', 'riichi', 'eligible'] }, right: { kind: 'literal', value: true } },
        ]),
        amountConstraint('ix3.tsumo-sen.eligible', 'tsumoSenStake', [
          { kind: 'compare', operator: 'eq', left: { kind: 'path', target: player, path: ['components', 'riichi', 'eligible'] }, right: { kind: 'literal', value: true } },
        ]),
        amountConstraint('ix3.bunbun.eligible', 'bunbunStake', [
          { kind: 'compare', operator: 'eq', left: { kind: 'path', target: player, path: ['components', 'riichi', 'eligible'] }, right: { kind: 'literal', value: true } },
        ]),
        {
          id: 'ix3.ron-source-policy', variables: [],
          constraints: [{
            kind: 'compare', operator: 'eq',
            left: {
              kind: 'aggregate', operator: 'count',
              source: {
                kind: 'filter', source: sourcePolicies, as: 'policy',
                where: {
                  kind: 'all', values: [
                    { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'policy' }, path: ['subjectId'] }, right: actorId },
                    { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'policy' }, path: ['state'] }, right: { kind: 'literal', value: 'active' } },
                    { kind: 'not', value: { kind: 'contains', collection: { kind: 'path', target: { kind: 'variable', name: 'policy' }, path: ['allowedModes'] }, value: { kind: 'literal', value: 'response' } } },
                  ],
                },
              },
            },
            right: { kind: 'literal', value: 0 },
          }],
          maxSolutions: 1,
          maxSteps: 20_000,
        },
      ],
      reducers: [],
      rewrites: [
        {
          id: 'ix3.pon-riichi.commit',
          operations: commitOperations('pon-riichi', 'ponRiichiStake', [{
            kind: 'append', path: ['world', 'entities', privilegeIndex, 'components', 'factTrack', 'records'],
            value: { kind: 'record', fields: { ...declarationBase('pon-riichi'), uraDora: { kind: 'literal', value: false }, ippatsu: { kind: 'literal', value: false }, exclusiveGroup: { kind: 'literal', value: 'riichi-declaration' } } },
          }]),
        },
        {
          id: 'ix3.hochi.commit',
          operations: commitOperations('hochi', 'hochiFee', [{
            kind: 'append', path: ['world', 'entities', declarationIndex, 'components', 'factTrack', 'records'],
            value: { kind: 'record', fields: { ...declarationBase('hochi-wait'), waitEvidenceId: { kind: 'path', target: params, path: ['waitEvidenceId'] }, waitForm: { kind: 'path', target: params, path: ['waitForm'] } } },
          }]),
        },
        {
          id: 'ix3.tsumo-sen.commit',
          operations: commitOperations('tsumo-sen', 'tsumoSenStake', [{
            kind: 'append', path: ['world', 'entities', sourcePolicyIndex, 'components', 'factTrack', 'records'],
            value: { kind: 'record', fields: { ...declarationBase('tsumo-sen-source-policy'), subjectId: actorId, allowedModes: { kind: 'literal', value: ['direct'] }, state: { kind: 'literal', value: 'active' } } },
          }]),
        },
        {
          id: 'ix3.bunbun.commit',
          operations: commitOperations('bunbun-riichi', 'bunbunStake', [
            {
              kind: 'append', path: ['world', 'entities', sourcePolicyIndex, 'components', 'factTrack', 'records'],
              value: { kind: 'record', fields: { ...declarationBase('bunbun-source-policy'), subjectId: actorId, allowedModes: { kind: 'literal', value: ['direct'] }, state: { kind: 'literal', value: 'active' } } },
            },
            {
              kind: 'append', path: ['world', 'entities', visibilityIndex, 'components', 'factTrack', 'records'],
              value: { kind: 'record', fields: { ...declarationBase('bunbun-visibility'), subjectId: actorId, audience: { kind: 'literal', value: 'all' }, scope: { kind: 'literal', value: 'hand' }, state: { kind: 'literal', value: 'active' } } },
            },
          ]),
        },
      ],
    },
  },
  patches: [
    {
      kind: 'action.requirements', actionId: 'ron', placement: 'append',
      values: [{ id: 'ron.ix3-win-source-policy', kind: 'core.constraint', programId: 'ix3.ron-source-policy', message: 'An active declaration restricts this player to direct/self-draw wins.' }],
    },
    {
      kind: 'action.requirements', actionId: 'declare-riichi', placement: 'append',
      values: [{ id: 'declare-riichi.no-ix3-exclusive', kind: 'core.constraint', programId: 'ix3.no-existing-declaration', message: 'A mutually exclusive declaration already exists.' }],
    },
  ],
  metadata: {
    sourcePage: 'http://www.ix3.jp/hiii/02mahken/1-10-1local.htm',
    sourceOrder: [2, 3, 4, 5],
    declarativeOnly: true,
  },
};

// The normal-riichi patch uses the same event-history condition as all local declaration actions.
(IX3_FIRST_TEN_DECLARATION_MODULE.additions?.corePrograms?.constraints as unknown[]).push({
  id: 'ix3.no-existing-declaration',
  variables: [],
  constraints: [{ kind: 'compare', operator: 'eq', left: { kind: 'aggregate', operator: 'count', source: existingPublishedDeclarationEvents }, right: { kind: 'literal', value: 0 } }],
  maxSolutions: 1,
  maxSteps: 20_000,
});

export const IX3_FIRST_TEN_MODULES: RuleModuleDefinition[] = [
  IX3_FIRST_TEN_DECLARATION_MODULE,
  IX3_FIRST_TEN_RESPONSE_EVALUATION_MODULE,
  IX3_FIRST_TEN_DIRECT_EVALUATION_MODULE,
];

export const IX3_FIRST_TEN_IMPLEMENTATION_STATUS = [
  { order: 1, id: 'local.special-dora', status: 'implemented', mechanism: 'expression-valued counted tile contribution; qualification amount zero' },
  { order: 2, id: 'local.pon-riichi', status: 'implemented', mechanism: 'post-pon declaration action, exclusive declaration fact and privilege policy' },
  { order: 3, id: 'local.hochi', status: 'implemented-with-evidence-binding', mechanism: 'single-wait evidence relation, 3000-point transfer and public wait declaration' },
  { order: 4, id: 'local.tsumo-sen', status: 'implemented', mechanism: 'declaration plus active win-source policy consumed by ron' },
  { order: 5, id: 'local.bunbun-riichi', status: 'implemented', mechanism: 'open visibility policy plus direct-only win-source policy' },
  { order: 6, id: 'local.tsubame-gaeshi', status: 'implemented', mechanism: 'source discard event correlated with another player’s riichi declaration action' },
  { order: 7, id: 'local.kakikomi', status: 'implemented', mechanism: 'white direct source plus uninterrupted first-own-draw declaration window' },
  { order: 8, id: 'local.no-chi-no-pon', status: 'implemented', mechanism: 'pre-hand commitment parameter plus absence of actor call events' },
  { order: 9, id: 'local.pon-chi-kan-ron', status: 'implemented', mechanism: 'ordered revision predicates over pon, chi, open-kan and response source' },
  { order: 10, id: 'local.dora-ho', status: 'implemented', mechanism: 'winning physical source face membership in active dora face data' },
] as const;
