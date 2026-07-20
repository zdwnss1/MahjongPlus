import type { CoreExpression, CoreFormula } from '@mahjongplus/world-calculus';
import {
  compileRegisteredContributionEvaluationModule,
  type RegisteredEligibilityRule,
  type RuleModuleDefinition,
} from '@mahjongplus/world-language';

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (...values: CoreFormula[]): CoreFormula => ({ kind: 'all', values });
const quantify = (
  quantifier: 'exists' | 'forall',
  source: CoreExpression,
  as: string,
  where: CoreFormula,
): CoreFormula => ({ kind: 'quantify', quantifier, source, as, where });

const context = variable('context');
const tile = variable('tile');

export const RIICHI_REGISTERED_ELIGIBILITY_RULES: RegisteredEligibilityRule[] = [
  {
    id: 'yaku.all-simples',
    title: 'All simples',
    predicate: quantify(
      'forall',
      path(context, 'tiles'),
      'tile',
      compare('eq', path(tile, 'terminalOrHonor'), literal(false)),
    ),
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'yaku.seven-pairs',
    title: 'Seven pairs',
    predicate: compare('eq', path(context, 'structureId'), literal('seven-pairs')),
    contributions: [{ dimension: 'han', operation: 'add', value: 2, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'yaku.thirteen-orphans',
    title: 'Thirteen orphans',
    predicate: compare('eq', path(context, 'structureId'), literal('thirteen-orphans')),
    contributions: [
      { dimension: 'han', operation: 'add', value: 13, stage: 'base-yaku' },
      { dimension: 'limit', operation: 'set', value: 'yakuman', stage: 'base-yaku' },
    ],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'yaku.closed-direct-win',
    title: 'Closed direct-source win',
    predicate: all(
      compare('eq', path(context, 'closed'), literal(true)),
      compare('eq', path(context, 'source', 'mode'), literal('direct')),
    ),
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
];

function compileSourceEvaluation(
  id: string,
  title: string,
  interpretationTrackId: string,
  fixedContextTrackId: string,
  waitTrackId: string,
  evaluationActionId: string,
  qualificationActionId: string,
  contributionTrackId: string,
  qualificationTrackId: string,
): RuleModuleDefinition {
  return compileRegisteredContributionEvaluationModule({
    id,
    version: '1.0.0',
    title,
    interpretationTrackId,
    fixedContextTrackId,
    waitTrackId,
    rules: RIICHI_REGISTERED_ELIGIBILITY_RULES,
    stageOrder: ['base-yaku', 'tile-effects', 'qualification'],
    qualificationStage: 'qualification',
    minimumQualification: 1,
    contributionTrackId,
    qualificationTrackId,
    evaluationActionId,
    qualificationActionId,
    shapeRelationTypes: ['has-hand-shape'],
    qualifiedRelationType: 'can-win-on',
  });
}

export const RIICHI_RESPONSE_REGISTERED_EVALUATION_MODULE = compileSourceEvaluation(
  'service.riichi-response-registered-evaluation',
  'Riichi response registered contribution evaluation',
  'track:hand-interpretations',
  'track:fixed-meld-interpretation-contexts',
  'track:wait-classifications',
  'evaluation.evaluate-response',
  'evaluation.qualify-response',
  'track:response-registered-contributions',
  'track:response-registered-qualifications',
);

export const RIICHI_DIRECT_REGISTERED_EVALUATION_MODULE = compileSourceEvaluation(
  'service.riichi-direct-registered-evaluation',
  'Riichi direct registered contribution evaluation',
  'track:direct-hand-interpretations',
  'track:direct-fixed-meld-contexts',
  'track:direct-wait-classifications',
  'evaluation.evaluate-direct',
  'evaluation.qualify-direct',
  'track:direct-registered-contributions',
  'track:direct-registered-qualifications',
);

export const RIICHI_REGISTERED_EVALUATION_MODULES: RuleModuleDefinition[] = [
  RIICHI_RESPONSE_REGISTERED_EVALUATION_MODULE,
  RIICHI_DIRECT_REGISTERED_EVALUATION_MODULE,
];
