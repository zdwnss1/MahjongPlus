import type { CoreExpression, CoreFormula } from '@mahjongplus/world-calculus';
import {
  compileRelatedFixedGroupInterpretationModule,
  type RuleModuleDefinition,
} from '@mahjongplus/world-language';
import { RIICHI_STANDARD_STRUCTURE_FIXED_GROUP_COUNTS } from './handStructureProfiles.js';

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (...values: CoreFormula[]): CoreFormula => ({ kind: 'all', values });
const contains = (collection: CoreExpression, value: CoreExpression): CoreFormula => ({ kind: 'contains', collection, value });
const quantify = (
  quantifier: 'exists' | 'forall',
  source: CoreExpression,
  as: string,
  where: CoreFormula,
): CoreFormula => ({ kind: 'quantify', quantifier, source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const distinct = (source: CoreExpression): CoreExpression => ({ kind: 'distinct', source });
const aggregate = (
  operator: 'count' | 'sum' | 'min' | 'max',
  source: CoreExpression,
  as?: string,
  value?: CoreExpression,
): CoreExpression => ({ kind: 'aggregate', operator, source, as, value });
const arithmetic = (
  operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo',
  left: CoreExpression,
  right: CoreExpression,
): CoreExpression => ({ kind: 'arithmetic', operator, left, right });

const members = variable('members');
const member = variable('member');
const tileField = (target: CoreExpression, field: string): CoreExpression => path(
  target,
  'attributes',
  'components',
  'tile',
  field,
);
const sameFace = quantify(
  'forall',
  members,
  'member',
  compare('eq', tileField(member, 'baseFace'), tileField(path(members, '0'), 'baseFace')),
);
const sameSuit = quantify(
  'forall',
  members,
  'member',
  compare('eq', tileField(member, 'suit'), tileField(path(members, '0'), 'suit')),
);
const numeric = quantify(
  'forall',
  members,
  'member',
  contains(literal(['m', 'p', 's']), tileField(member, 'suit')),
);
const ranks = map(members, 'member', tileField(member, 'rank'));
const consecutive = all(
  numeric,
  sameSuit,
  compare('eq', aggregate('count', distinct(ranks)), literal(3)),
  compare(
    'eq',
    arithmetic(
      'subtract',
      aggregate('max', members, 'member', tileField(member, 'rank')),
      aggregate('min', members, 'member', tileField(member, 'rank')),
    ),
    literal(2),
  ),
);

const profileFixedGroupCounts = {
  ...RIICHI_STANDARD_STRUCTURE_FIXED_GROUP_COUNTS,
  'structure.seven-pairs': 0,
  'structure.thirteen-orphans': 0,
};
const patterns = [
  { groupType: 'pon', patternId: 'group.triplet.same-face', size: 3, predicate: sameFace },
  { groupType: 'chi', patternId: 'group.sequence.same-suit', size: 3, predicate: consecutive },
  { groupType: 'open-kan', patternId: 'group.quad.same-face', size: 4, predicate: sameFace },
];

function compileSourceFixedMeldModule(
  id: string,
  title: string,
  actionId: string,
  trackId: string,
): RuleModuleDefinition {
  const compiled = compileRelatedFixedGroupInterpretationModule({
    id,
    version: '1.0.0',
    title,
    interpretationActionIds: [actionId],
    profileFixedGroupCounts,
    groupEntityKind: 'meld',
    groupOwnerPath: ['components', 'meld', 'ownerId'],
    groupTypePath: ['components', 'meld', 'callType'],
    membershipRelationType: 'contains',
    patterns,
    trackId,
    shapeRelationType: 'has-hand-shape',
  });
  return {
    ...compiled,
    metadata: {
      ...compiled.metadata,
      integrationStatus: 'partial',
      fixedGroupsAreAtomic: true,
      grantsScore: false,
      grantsWinSettlement: false,
      interpretationActionId: actionId,
    },
  };
}

export const RIICHI_RESPONSE_FIXED_MELD_CONTEXT_MODULE = compileSourceFixedMeldModule(
  'service.riichi-response-fixed-meld-context',
  'Riichi response existing meld interpretation context',
  'interpretation.submit-response',
  'track:fixed-meld-interpretation-contexts',
);

export const RIICHI_DIRECT_FIXED_MELD_CONTEXT_MODULE = compileSourceFixedMeldModule(
  'service.riichi-direct-fixed-meld-context',
  'Riichi direct existing meld interpretation context',
  'interpretation.submit-direct',
  'track:direct-fixed-meld-contexts',
);

/** Backwards-compatible data alias for the response-source module. */
export const RIICHI_FIXED_MELD_CONTEXT_MODULE = RIICHI_RESPONSE_FIXED_MELD_CONTEXT_MODULE;

export const RIICHI_FIXED_MELD_CONTEXT_MODULES: RuleModuleDefinition[] = [
  RIICHI_RESPONSE_FIXED_MELD_CONTEXT_MODULE,
  RIICHI_DIRECT_FIXED_MELD_CONTEXT_MODULE,
];
