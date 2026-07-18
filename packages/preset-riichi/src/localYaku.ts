import type {
  CoreExpression,
  CoreFormula,
  EventReducerDefinition,
  FiniteDomainProgram,
} from '@mahjongplus/world-calculus';

export interface LocalYakuAward {
  contributions: Array<{
    dimension: string;
    operation: 'add' | 'set';
    value: number | string;
  }>;
}

export interface LocalYakuFixture {
  id: string;
  title: string;
  eligibility: FiniteDomainProgram;
  award: LocalYakuAward;
  reducer?: EventReducerDefinition;
  parameters?: Record<string, unknown>;
}

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
const not = (value: CoreFormula): CoreFormula => ({ kind: 'not', value });
const contains = (collection: CoreExpression, value: CoreExpression): CoreFormula => ({ kind: 'contains', collection, value });
const quantify = (
  quantifier: 'exists' | 'forall',
  source: CoreExpression,
  as: string,
  where: CoreFormula,
): CoreFormula => ({ kind: 'quantify', quantifier, source, as, where });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const aggregate = (
  operator: 'count' | 'sum' | 'min' | 'max',
  source: CoreExpression,
): CoreExpression => ({ kind: 'aggregate', operator, source });
const arithmetic = (
  operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo',
  left: CoreExpression,
  right: CoreExpression,
): CoreExpression => ({ kind: 'arithmetic', operator, left, right });

function countWhere(source: CoreExpression, as: string, where: CoreFormula): CoreExpression {
  return aggregate('count', filter(source, as, where));
}

function externalConstraint(id: string, formula: CoreFormula): FiniteDomainProgram {
  return { id, variables: [], constraints: [formula], maxSolutions: 1, maxSteps: 100_000 };
}

function tileRankCount(hand: CoreExpression, rank: number): CoreExpression {
  return countWhere(hand, 'tile', compare('eq', path(variable('tile'), 'rank'), literal(rank)));
}

export function openNineGatesFixture(han = 2): LocalYakuFixture {
  const hand = variable('hand');
  const targetSuit = variable('targetSuit');
  const requirements = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  return {
    id: 'local.open-nine-gates',
    title: '鸣牌九莲宝灯',
    eligibility: externalConstraint('local.open-nine-gates.eligible', all(
      compare('eq', variable('winAccepted'), literal(true)),
      compare('eq', variable('closed'), literal(false)),
      compare('eq', aggregate('count', hand), literal(14)),
      contains(literal(['m', 'p', 's']), targetSuit),
      quantify('forall', hand, 'tile', compare('eq', path(variable('tile'), 'suit'), targetSuit)),
      ...requirements.map((minimum, index) => compare('gte', tileRankCount(hand, index + 1), literal(minimum))),
    )),
    award: { contributions: [{ dimension: 'han', operation: 'add', value: han }] },
  };
}

export function lowSumManzuFlushFixture(maxRankSum = 35, han = 13): LocalYakuFixture {
  const hand = variable('hand');
  return {
    id: 'local.low-sum-manzu-flush',
    title: '万字清一色·数字和不大于35',
    eligibility: externalConstraint('local.low-sum-manzu-flush.eligible', all(
      compare('eq', variable('winAccepted'), literal(true)),
      compare('eq', aggregate('count', hand), literal(14)),
      quantify('forall', hand, 'tile', compare('eq', path(variable('tile'), 'suit'), literal('m'))),
      compare('lte', aggregate('sum', map(hand, 'tile', path(variable('tile'), 'rank'))), literal(maxRankSum)),
    )),
    award: {
      contributions: [
        { dimension: 'han', operation: 'add', value: han },
        { dimension: 'limit', operation: 'set', value: 'yakuman' },
      ],
    },
    parameters: { maxRankSum },
  };
}

export interface StoneOnThreeYearsOptions {
  allowRiverBottom?: boolean;
  han?: number;
}

export function stoneOnThreeYearsFixture(options: StoneOnThreeYearsOptions = {}): LocalYakuFixture {
  const allowRiverBottom = options.allowRiverBottom ?? true;
  const allowedContexts = allowRiverBottom
    ? ['last-live-wall-draw', 'last-live-wall-discard']
    : ['last-live-wall-draw'];
  const win = variable('win');
  const events = variable('events');
  return {
    id: 'local.stone-on-three-years',
    title: '石上三年',
    eligibility: externalConstraint('local.stone-on-three-years.eligible', all(
      compare('eq', variable('winAccepted'), literal(true)),
      compare('eq', path(win, 'closed'), literal(true)),
      contains(literal(allowedContexts), path(win, 'context')),
      quantify('exists', events, 'riichi', all(
        compare('eq', path(variable('riichi'), 'type'), literal('double-riichi.committed')),
        compare('eq', path(variable('riichi'), 'actorId'), path(win, 'actorId')),
        compare('lt', path(variable('riichi'), 'index'), path(win, 'index')),
        not(quantify('exists', events, 'cancel', all(
          compare('eq', path(variable('cancel'), 'type'), literal('riichi.cancelled')),
          compare('eq', path(variable('cancel'), 'actorId'), path(win, 'actorId')),
          compare('gt', path(variable('cancel'), 'index'), path(variable('riichi'), 'index')),
          compare('lt', path(variable('cancel'), 'index'), path(win, 'index')),
        ))),
      )),
    )),
    award: {
      contributions: [
        { dimension: 'han', operation: 'add', value: options.han ?? 13 },
        { dimension: 'limit', operation: 'set', value: 'yakuman' },
      ],
    },
    parameters: { allowRiverBottom },
  };
}

export interface ThirteenMisfitsOptions {
  limit?: 'yakuman' | 'mangan';
  excludeThirteenOrphans?: boolean;
}

export function thirteenMisfitsFixture(options: ThirteenMisfitsOptions = {}): LocalYakuFixture {
  const hand = variable('hand');
  const faceCountFor = (tile: CoreExpression): CoreExpression => countWhere(
    hand,
    'other',
    compare('eq', path(variable('other'), 'face'), path(tile, 'face')),
  );
  const pairMembers = filter(
    hand,
    'tile',
    compare('eq', faceCountFor(variable('tile')), literal(2)),
  );
  const forbiddenTaatsu = quantify('exists', hand, 'left', quantify('exists', hand, 'right', all(
    compare('neq', path(variable('left'), 'id'), path(variable('right'), 'id')),
    compare('eq', path(variable('left'), 'numeric'), literal(true)),
    compare('eq', path(variable('right'), 'numeric'), literal(true)),
    compare('eq', path(variable('left'), 'suit'), path(variable('right'), 'suit')),
    any(
      compare('eq', arithmetic('subtract', path(variable('right'), 'rank'), path(variable('left'), 'rank')), literal(1)),
      compare('eq', arithmetic('subtract', path(variable('right'), 'rank'), path(variable('left'), 'rank')), literal(2)),
    ),
  )));
  const timing = any(
    all(compare('eq', variable('dealer'), literal(true)), compare('eq', variable('phase'), literal('after-deal'))),
    all(compare('eq', variable('dealer'), literal(false)), compare('eq', variable('phase'), literal('after-first-draw'))),
  );
  const constraints: CoreFormula[] = [
    timing,
    compare('eq', variable('callCount'), literal(0)),
    compare('eq', aggregate('count', hand), literal(14)),
    quantify('forall', hand, 'tile', compare('lte', faceCountFor(variable('tile')), literal(2))),
    compare('eq', aggregate('count', pairMembers), literal(2)),
    not(forbiddenTaatsu),
  ];
  if (options.excludeThirteenOrphans ?? true) {
    constraints.push(not(quantify(
      'forall',
      hand,
      'tile',
      compare('eq', path(variable('tile'), 'terminalOrHonor'), literal(true)),
    )));
  }
  const limit = options.limit ?? 'yakuman';
  return {
    id: 'local.thirteen-misfits',
    title: '十三不搭',
    eligibility: externalConstraint('local.thirteen-misfits.eligible', all(...constraints)),
    award: {
      contributions: limit === 'yakuman'
        ? [
            { dimension: 'han', operation: 'add', value: 13 },
            { dimension: 'limit', operation: 'set', value: 'yakuman' },
          ]
        : [{ dimension: 'limit', operation: 'set', value: 'mangan' }],
    },
    parameters: { limit, excludeThirteenOrphans: options.excludeThirteenOrphans ?? true },
  };
}

export interface EightConsecutiveWinsOptions {
  trackedPlayerId?: string;
  resetOnDraw?: boolean;
  requireIndependentYaku?: boolean;
}

export function eightConsecutiveWinsFixture(options: EightConsecutiveWinsOptions = {}): LocalYakuFixture {
  const trackedPlayerId = options.trackedPlayerId ?? 'east';
  const resetOnDraw = options.resetOnDraw ?? true;
  const requireIndependentYaku = options.requireIndependentYaku ?? true;
  const reducer: EventReducerDefinition = {
    id: `local.eight-consecutive-wins.reducer:${trackedPlayerId}`,
    initialState: { count: 0 },
    transitions: [{
      when: all(
        compare('eq', path(variable('event'), 'type'), literal('hand.ended')),
        compare('eq', path(variable('event'), 'winnerId'), literal(trackedPlayerId)),
      ),
      updates: [{
        path: ['count'],
        value: arithmetic('add', path(variable('state'), 'count'), literal(1)),
      }],
    }, {
      when: all(
        compare('eq', path(variable('event'), 'type'), literal('hand.ended')),
        compare('neq', path(variable('event'), 'winnerId'), literal(trackedPlayerId)),
      ),
      updates: [{ path: ['count'], value: literal(0) }],
    }, {
      when: all(
        compare('eq', literal(resetOnDraw), literal(true)),
        compare('eq', path(variable('event'), 'type'), literal('hand.drawn')),
      ),
      updates: [{ path: ['count'], value: literal(0) }],
    }],
  };
  return {
    id: `local.eight-consecutive-wins:${trackedPlayerId}`,
    title: '八连庄',
    reducer,
    eligibility: externalConstraint(`local.eight-consecutive-wins.eligible:${trackedPlayerId}`, all(
      compare('gte', path(variable('streak'), 'count'), literal(8)),
      any(
        compare('eq', literal(requireIndependentYaku), literal(false)),
        compare('gte', variable('ordinaryHan'), literal(1)),
      ),
    )),
    award: {
      contributions: [
        { dimension: 'han', operation: 'add', value: 13 },
        { dimension: 'limit', operation: 'set', value: 'yakuman' },
      ],
    },
    parameters: { trackedPlayerId, resetOnDraw, requireIndependentYaku },
  };
}

export function localYakuFixtures(): LocalYakuFixture[] {
  return [
    openNineGatesFixture(),
    lowSumManzuFlushFixture(),
    stoneOnThreeYearsFixture(),
    thirteenMisfitsFixture(),
    eightConsecutiveWinsFixture(),
  ];
}
