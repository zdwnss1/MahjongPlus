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

const compiled = compileRelatedFixedGroupInterpretationModule({
  id: 'service.riichi-fixed-meld-context',
  version: '1.0.0',
  title: 'Riichi existing meld interpretation context',
  interpretationActionIds: ['interpretation.submit-response', 'interpretation.submit-direct'],
  profileFixedGroupCounts: {
    ...RIICHI_STANDARD_STRUCTURE_FIXED_GROUP_COUNTS,
    'structure.seven-pairs': 0,
    'structure.thirteen-orphans': 0,
  },
  groupEntityKind: 'meld',
  groupOwnerPath: ['components', 'meld', 'ownerId'],
  groupTypePath: ['components', 'meld', 'callType'],
  membershipRelationType: 'contains',
  patterns: [
    { groupType: 'pon', patternId: 'group.triplet.same-face', size: 3, predicate: sameFace },
    { groupType: 'chi', patternId: 'group.sequence.same-suit', size: 3, predicate: consecutive },
    { groupType: 'open-kan', patternId: 'group.quad.same-face', size: 4, predicate: sameFace },
  ],
  trackId: 'track:fixed-meld-interpretation-contexts',
  shapeRelationType: 'has-hand-shape',
});

export const RIICHI_FIXED_MELD_CONTEXT_MODULE: RuleModuleDefinition = {
  ...compiled,
  metadata: {
    ...compiled.metadata,
    integrationStatus: 'partial',
    fixedGroupsAreAtomic: true,
    grantsScore: false,
    grantsWinSettlement: false,
  },
};
