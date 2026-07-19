import type { CoreExpression, CoreFormula } from '@mahjongplus/world-calculus';
import {
  compileResponsePartitionInterpretationModule,
  type PartitionInterpretationProfile,
  type PartitionInterpretationRegistryDefinition,
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
const any = (...values: CoreFormula[]): CoreFormula => ({ kind: 'any', values });
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
const memberTile = (target: CoreExpression, field: string): CoreExpression => path(
  target,
  'attributes',
  'components',
  'tile',
  field,
);
const firstFace = memberTile(path(members, '0'), 'baseFace');
const sameFace = quantify('forall', members, 'member', compare('eq', memberTile(member, 'baseFace'), firstFace));
const orphan = (target: CoreExpression): CoreFormula => any(
  compare('eq', memberTile(target, 'suit'), literal('z')),
  compare('eq', memberTile(target, 'rank'), literal(1)),
  compare('eq', memberTile(target, 'rank'), literal(9)),
);
const allOrphans = quantify('forall', members, 'member', orphan(member));
const numericSuit = contains(literal(['m', 'p', 's']), memberTile(member, 'suit'));
const sameSuit = quantify(
  'forall',
  members,
  'member',
  compare('eq', memberTile(member, 'suit'), memberTile(path(members, '0'), 'suit')),
);
const ranks = map(members, 'member', memberTile(member, 'rank'));
const consecutiveRanks = all(
  quantify('forall', members, 'member', numericSuit),
  sameSuit,
  compare('eq', aggregate('count', distinct(ranks)), literal(3)),
  compare(
    'eq',
    arithmetic(
      'subtract',
      aggregate('max', members, 'member', memberTile(member, 'rank')),
      aggregate('min', members, 'member', memberTile(member, 'rank')),
    ),
    literal(2),
  ),
);

const allItems = variable('items');
const item = variable('item');
const distinctItemFaces = aggregate('count', distinct(map(
  allItems,
  'item',
  memberTile(item, 'baseFace'),
)));

export const RIICHI_HAND_STRUCTURE_PROFILES: PartitionInterpretationProfile[] = [
  {
    id: 'structure.standard-four-groups-pair',
    title: 'Four groups and one pair',
    groupPatterns: [
      { id: 'group.triplet.same-face', size: 3, predicate: sameFace },
      { id: 'group.sequence.same-suit', size: 3, predicate: consecutiveRanks },
      { id: 'group.pair.same-face', size: 2, predicate: sameFace },
    ],
    structures: [{
      id: 'four-groups-pair',
      slots: [
        { id: 'group', count: 4, alternatives: ['group.triplet.same-face', 'group.sequence.same-suit'] },
        { id: 'pair', count: 1, alternatives: ['group.pair.same-face'] },
      ],
    }],
    maxProposals: 24,
    candidateLimit: 24,
    maxSteps: 250_000,
  },
  {
    id: 'structure.seven-pairs',
    title: 'Seven distinct pairs',
    groupPatterns: [
      { id: 'group.pair.same-face', size: 2, predicate: sameFace },
    ],
    structures: [{
      id: 'seven-pairs',
      slots: [{ id: 'pair', count: 7, alternatives: ['group.pair.same-face'] }],
      predicate: compare('eq', distinctItemFaces, literal(7)),
    }],
    maxProposals: 16,
    candidateLimit: 16,
    maxSteps: 100_000,
  },
  {
    id: 'structure.thirteen-orphans',
    title: 'Thirteen distinct orphan faces with one duplicate',
    groupPatterns: [
      { id: 'group.orphan-pair', size: 2, predicate: all(sameFace, allOrphans) },
      { id: 'group.orphan-singleton', size: 1, predicate: allOrphans },
    ],
    structures: [{
      id: 'thirteen-orphans',
      slots: [
        { id: 'pair', count: 1, alternatives: ['group.orphan-pair'] },
        { id: 'single', count: 12, alternatives: ['group.orphan-singleton'] },
      ],
      predicate: compare('eq', distinctItemFaces, literal(13)),
    }],
    maxProposals: 16,
    candidateLimit: 16,
    maxSteps: 100_000,
  },
];

export const RIICHI_RESPONSE_INTERPRETATION_REGISTRY: PartitionInterpretationRegistryDefinition = {
  id: 'service.riichi-response-hand-interpretation',
  version: '1.0.0',
  title: 'Riichi response hand interpretation',
  profiles: RIICHI_HAND_STRUCTURE_PROFILES,
  actionId: 'interpretation.submit-response',
  trackId: 'track:hand-interpretations',
  eventType: 'hand-interpretation.accepted',
  allowedWindowDefinitionIds: ['riichi.discard-response'],
};

const compiledInterpretationModule = compileResponsePartitionInterpretationModule(
  RIICHI_RESPONSE_INTERPRETATION_REGISTRY,
);

export const RIICHI_RESPONSE_INTERPRETATION_MODULE: RuleModuleDefinition = {
  ...compiledInterpretationModule,
  metadata: {
    ...compiledInterpretationModule.metadata,
    integrationStatus: 'partial',
    grantsScore: false,
    grantsWinSettlement: false,
    bindingSelectors: {
      evidenceRelationType: { type: 'literal', value: 'can-win-on' },
    },
  },
};
