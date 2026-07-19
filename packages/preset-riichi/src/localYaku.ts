import type {
  EventReducerDefinition,
  FiniteDomainProgram,
} from '@mahjongplus/world-calculus';
import type { RuleModuleDefinition } from '@mahjongplus/world-language';

export interface LocalYakuAward {
  contributions: Array<{
    dimension: string;
    operation: 'add' | 'set';
    value: number | string;
  }>;
}

export interface LocalYakuModuleArtifacts {
  eligibility: FiniteDomainProgram;
  award: LocalYakuAward;
  reducer?: EventReducerDefinition;
  parameters?: Record<string, unknown>;
}

export const LOCAL_YAKU_MODULES: RuleModuleDefinition[] = [
  {
    id: 'local.open-nine-gates',
    version: '1.0.0',
    title: '鸣牌九莲宝灯',
    parameters: {
      schema: {
        type: 'object',
        properties: {
          han: { type: 'number', integer: true, minimum: 0 },
        },
        required: ['han'],
        additionalProperties: false,
      },
      defaults: { han: 2 },
    },
    artifacts: {
      eligibility: {
        id: 'local.open-nine-gates.eligible',
        variables: [],
        constraints: [{
          kind: 'all',
          values: [
            { kind: 'compare', operator: 'eq', left: { kind: 'variable', name: 'winAccepted' }, right: { kind: 'literal', value: true } },
            { kind: 'compare', operator: 'eq', left: { kind: 'variable', name: 'closed' }, right: { kind: 'literal', value: false } },
            {
              kind: 'compare', operator: 'eq',
              left: { kind: 'aggregate', operator: 'count', source: { kind: 'variable', name: 'hand' } },
              right: { kind: 'literal', value: 14 },
            },
            {
              kind: 'contains', collection: { kind: 'literal', value: ['m', 'p', 's'] },
              value: { kind: 'variable', name: 'targetSuit' },
            },
            {
              kind: 'quantify', quantifier: 'forall', source: { kind: 'variable', name: 'hand' }, as: 'tile',
              where: {
                kind: 'compare', operator: 'eq',
                left: { kind: 'path', target: { kind: 'variable', name: 'tile' }, path: ['suit'] },
                right: { kind: 'variable', name: 'targetSuit' },
              },
            },
            ...[3, 1, 1, 1, 1, 1, 1, 1, 3].map((minimum, index) => ({
              kind: 'compare' as const,
              operator: 'gte' as const,
              left: {
                kind: 'aggregate' as const,
                operator: 'count' as const,
                source: {
                  kind: 'filter' as const,
                  source: { kind: 'variable' as const, name: 'hand' },
                  as: 'tile',
                  where: {
                    kind: 'compare' as const,
                    operator: 'eq' as const,
                    left: { kind: 'path' as const, target: { kind: 'variable' as const, name: 'tile' }, path: ['rank'] },
                    right: { kind: 'literal' as const, value: index + 1 },
                  },
                },
              },
              right: { kind: 'literal' as const, value: minimum },
            })),
          ],
        }],
        maxSolutions: 1,
        maxSteps: 100_000,
      },
      award: {
        contributions: [{
          dimension: 'han',
          operation: 'add',
          value: { $module: 'ref', path: 'parameters.han' },
        }],
      },
      parameters: { han: { $module: 'ref', path: 'parameters.han' } },
    },
  },
  {
    id: 'local.low-sum-manzu-flush',
    version: '1.0.0',
    title: '万字清一色·数字和不大于35',
    parameters: {
      schema: {
        type: 'object',
        properties: {
          maxRankSum: { type: 'number', integer: true, minimum: 0 },
          han: { type: 'number', integer: true, minimum: 0 },
        },
        required: ['maxRankSum', 'han'],
        additionalProperties: false,
      },
      defaults: { maxRankSum: 35, han: 13 },
    },
    artifacts: {
      eligibility: {
        id: 'local.low-sum-manzu-flush.eligible',
        variables: [],
        constraints: [{
          kind: 'all',
          values: [
            { kind: 'compare', operator: 'eq', left: { kind: 'variable', name: 'winAccepted' }, right: { kind: 'literal', value: true } },
            {
              kind: 'compare', operator: 'eq',
              left: { kind: 'aggregate', operator: 'count', source: { kind: 'variable', name: 'hand' } },
              right: { kind: 'literal', value: 14 },
            },
            {
              kind: 'quantify', quantifier: 'forall', source: { kind: 'variable', name: 'hand' }, as: 'tile',
              where: {
                kind: 'compare', operator: 'eq',
                left: { kind: 'path', target: { kind: 'variable', name: 'tile' }, path: ['suit'] },
                right: { kind: 'literal', value: 'm' },
              },
            },
            {
              kind: 'compare', operator: 'lte',
              left: {
                kind: 'aggregate', operator: 'sum',
                source: {
                  kind: 'map', source: { kind: 'variable', name: 'hand' }, as: 'tile',
                  select: { kind: 'path', target: { kind: 'variable', name: 'tile' }, path: ['rank'] },
                },
              },
              right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.maxRankSum' } },
            },
          ],
        }],
        maxSolutions: 1,
        maxSteps: 100_000,
      },
      award: {
        contributions: [
          { dimension: 'han', operation: 'add', value: { $module: 'ref', path: 'parameters.han' } },
          { dimension: 'limit', operation: 'set', value: 'yakuman' },
        ],
      },
      parameters: { maxRankSum: { $module: 'ref', path: 'parameters.maxRankSum' } },
    },
  },
  {
    id: 'local.stone-on-three-years',
    version: '1.0.0',
    title: '石上三年',
    parameters: {
      schema: {
        type: 'object',
        properties: {
          allowRiverBottom: { type: 'boolean' },
          han: { type: 'number', integer: true, minimum: 0 },
        },
        required: ['allowRiverBottom', 'han'],
        additionalProperties: false,
      },
      defaults: { allowRiverBottom: true, han: 13 },
    },
    artifacts: {
      eligibility: {
        id: 'local.stone-on-three-years.eligible',
        variables: [],
        constraints: [{
          kind: 'all',
          values: [
            { kind: 'compare', operator: 'eq', left: { kind: 'variable', name: 'winAccepted' }, right: { kind: 'literal', value: true } },
            {
              kind: 'compare', operator: 'eq',
              left: { kind: 'path', target: { kind: 'variable', name: 'win' }, path: ['closed'] },
              right: { kind: 'literal', value: true },
            },
            {
              kind: 'contains',
              collection: {
                kind: 'literal',
                value: {
                  $module: 'if',
                  condition: { $module: 'ref', path: 'parameters.allowRiverBottom' },
                  then: ['last-live-wall-draw', 'last-live-wall-discard'],
                  else: ['last-live-wall-draw'],
                },
              },
              value: { kind: 'path', target: { kind: 'variable', name: 'win' }, path: ['context'] },
            },
            {
              kind: 'quantify', quantifier: 'exists', source: { kind: 'variable', name: 'events' }, as: 'riichi',
              where: {
                kind: 'all',
                values: [
                  {
                    kind: 'compare', operator: 'eq',
                    left: { kind: 'path', target: { kind: 'variable', name: 'riichi' }, path: ['type'] },
                    right: { kind: 'literal', value: 'double-riichi.committed' },
                  },
                  {
                    kind: 'compare', operator: 'eq',
                    left: { kind: 'path', target: { kind: 'variable', name: 'riichi' }, path: ['actorId'] },
                    right: { kind: 'path', target: { kind: 'variable', name: 'win' }, path: ['actorId'] },
                  },
                  {
                    kind: 'compare', operator: 'lt',
                    left: { kind: 'path', target: { kind: 'variable', name: 'riichi' }, path: ['index'] },
                    right: { kind: 'path', target: { kind: 'variable', name: 'win' }, path: ['index'] },
                  },
                  {
                    kind: 'not',
                    value: {
                      kind: 'quantify', quantifier: 'exists', source: { kind: 'variable', name: 'events' }, as: 'cancel',
                      where: {
                        kind: 'all',
                        values: [
                          {
                            kind: 'compare', operator: 'eq',
                            left: { kind: 'path', target: { kind: 'variable', name: 'cancel' }, path: ['type'] },
                            right: { kind: 'literal', value: 'riichi.cancelled' },
                          },
                          {
                            kind: 'compare', operator: 'eq',
                            left: { kind: 'path', target: { kind: 'variable', name: 'cancel' }, path: ['actorId'] },
                            right: { kind: 'path', target: { kind: 'variable', name: 'win' }, path: ['actorId'] },
                          },
                          {
                            kind: 'compare', operator: 'gt',
                            left: { kind: 'path', target: { kind: 'variable', name: 'cancel' }, path: ['index'] },
                            right: { kind: 'path', target: { kind: 'variable', name: 'riichi' }, path: ['index'] },
                          },
                          {
                            kind: 'compare', operator: 'lt',
                            left: { kind: 'path', target: { kind: 'variable', name: 'cancel' }, path: ['index'] },
                            right: { kind: 'path', target: { kind: 'variable', name: 'win' }, path: ['index'] },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          ],
        }],
        maxSolutions: 1,
        maxSteps: 100_000,
      },
      award: {
        contributions: [
          { dimension: 'han', operation: 'add', value: { $module: 'ref', path: 'parameters.han' } },
          { dimension: 'limit', operation: 'set', value: 'yakuman' },
        ],
      },
      parameters: { allowRiverBottom: { $module: 'ref', path: 'parameters.allowRiverBottom' } },
    },
  },
  {
    id: 'local.thirteen-misfits',
    version: '1.0.0',
    title: '十三不搭',
    parameters: {
      schema: {
        type: 'object',
        properties: {
          limit: { type: 'string', enum: ['yakuman', 'mangan'] },
          excludeThirteenOrphans: { type: 'boolean' },
        },
        required: ['limit', 'excludeThirteenOrphans'],
        additionalProperties: false,
      },
      defaults: { limit: 'yakuman', excludeThirteenOrphans: true },
    },
    artifacts: {
      eligibility: {
        id: 'local.thirteen-misfits.eligible',
        variables: [],
        constraints: [{
          kind: 'all',
          values: [
            {
              kind: 'any',
              values: [
                {
                  kind: 'all', values: [
                    { kind: 'compare', operator: 'eq', left: { kind: 'variable', name: 'dealer' }, right: { kind: 'literal', value: true } },
                    { kind: 'compare', operator: 'eq', left: { kind: 'variable', name: 'phase' }, right: { kind: 'literal', value: 'after-deal' } },
                  ],
                },
                {
                  kind: 'all', values: [
                    { kind: 'compare', operator: 'eq', left: { kind: 'variable', name: 'dealer' }, right: { kind: 'literal', value: false } },
                    { kind: 'compare', operator: 'eq', left: { kind: 'variable', name: 'phase' }, right: { kind: 'literal', value: 'after-first-draw' } },
                  ],
                },
              ],
            },
            { kind: 'compare', operator: 'eq', left: { kind: 'variable', name: 'callCount' }, right: { kind: 'literal', value: 0 } },
            {
              kind: 'compare', operator: 'eq',
              left: { kind: 'aggregate', operator: 'count', source: { kind: 'variable', name: 'hand' } },
              right: { kind: 'literal', value: 14 },
            },
            {
              kind: 'quantify', quantifier: 'forall', source: { kind: 'variable', name: 'hand' }, as: 'tile',
              where: {
                kind: 'compare', operator: 'lte',
                left: {
                  kind: 'aggregate', operator: 'count',
                  source: {
                    kind: 'filter', source: { kind: 'variable', name: 'hand' }, as: 'other',
                    where: {
                      kind: 'compare', operator: 'eq',
                      left: { kind: 'path', target: { kind: 'variable', name: 'other' }, path: ['face'] },
                      right: { kind: 'path', target: { kind: 'variable', name: 'tile' }, path: ['face'] },
                    },
                  },
                },
                right: { kind: 'literal', value: 2 },
              },
            },
            {
              kind: 'compare', operator: 'eq',
              left: {
                kind: 'aggregate', operator: 'count',
                source: {
                  kind: 'filter', source: { kind: 'variable', name: 'hand' }, as: 'tile',
                  where: {
                    kind: 'compare', operator: 'eq',
                    left: {
                      kind: 'aggregate', operator: 'count',
                      source: {
                        kind: 'filter', source: { kind: 'variable', name: 'hand' }, as: 'other',
                        where: {
                          kind: 'compare', operator: 'eq',
                          left: { kind: 'path', target: { kind: 'variable', name: 'other' }, path: ['face'] },
                          right: { kind: 'path', target: { kind: 'variable', name: 'tile' }, path: ['face'] },
                        },
                      },
                    },
                    right: { kind: 'literal', value: 2 },
                  },
                },
              },
              right: { kind: 'literal', value: 2 },
            },
            {
              kind: 'not',
              value: {
                kind: 'quantify', quantifier: 'exists', source: { kind: 'variable', name: 'hand' }, as: 'left',
                where: {
                  kind: 'quantify', quantifier: 'exists', source: { kind: 'variable', name: 'hand' }, as: 'right',
                  where: {
                    kind: 'all',
                    values: [
                      {
                        kind: 'compare', operator: 'neq',
                        left: { kind: 'path', target: { kind: 'variable', name: 'left' }, path: ['id'] },
                        right: { kind: 'path', target: { kind: 'variable', name: 'right' }, path: ['id'] },
                      },
                      { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'left' }, path: ['numeric'] }, right: { kind: 'literal', value: true } },
                      { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'right' }, path: ['numeric'] }, right: { kind: 'literal', value: true } },
                      {
                        kind: 'compare', operator: 'eq',
                        left: { kind: 'path', target: { kind: 'variable', name: 'left' }, path: ['suit'] },
                        right: { kind: 'path', target: { kind: 'variable', name: 'right' }, path: ['suit'] },
                      },
                      {
                        kind: 'any',
                        values: [1, 2].map((distance) => ({
                          kind: 'compare' as const,
                          operator: 'eq' as const,
                          left: {
                            kind: 'arithmetic' as const,
                            operator: 'subtract' as const,
                            left: { kind: 'path' as const, target: { kind: 'variable' as const, name: 'right' }, path: ['rank'] },
                            right: { kind: 'path' as const, target: { kind: 'variable' as const, name: 'left' }, path: ['rank'] },
                          },
                          right: { kind: 'literal' as const, value: distance },
                        })),
                      },
                    ],
                  },
                },
              },
            },
            {
              kind: 'any',
              values: [
                {
                  kind: 'compare', operator: 'eq',
                  left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.excludeThirteenOrphans' } },
                  right: { kind: 'literal', value: false },
                },
                {
                  kind: 'not',
                  value: {
                    kind: 'quantify', quantifier: 'forall', source: { kind: 'variable', name: 'hand' }, as: 'tile',
                    where: {
                      kind: 'compare', operator: 'eq',
                      left: { kind: 'path', target: { kind: 'variable', name: 'tile' }, path: ['terminalOrHonor'] },
                      right: { kind: 'literal', value: true },
                    },
                  },
                },
              ],
            },
          ],
        }],
        maxSolutions: 1,
        maxSteps: 100_000,
      },
      award: {
        contributions: {
          $module: 'if',
          condition: {
            $module: 'eq',
            left: { $module: 'ref', path: 'parameters.limit' },
            right: 'yakuman',
          },
          then: [
            { dimension: 'han', operation: 'add', value: 13 },
            { dimension: 'limit', operation: 'set', value: 'yakuman' },
          ],
          else: [{ dimension: 'limit', operation: 'set', value: 'mangan' }],
        },
      },
      parameters: {
        limit: { $module: 'ref', path: 'parameters.limit' },
        excludeThirteenOrphans: { $module: 'ref', path: 'parameters.excludeThirteenOrphans' },
      },
    },
  },
  {
    id: 'local.eight-consecutive-wins',
    version: '1.0.0',
    title: '八连庄',
    parameters: {
      schema: {
        type: 'object',
        properties: {
          trackedPlayerId: { type: 'string', minLength: 1 },
          resetOnDraw: { type: 'boolean' },
          requireIndependentYaku: { type: 'boolean' },
        },
        required: ['trackedPlayerId', 'resetOnDraw', 'requireIndependentYaku'],
        additionalProperties: false,
      },
      defaults: { trackedPlayerId: 'east', resetOnDraw: true, requireIndependentYaku: true },
    },
    artifacts: {
      reducer: {
        id: { $module: 'template', value: 'local.eight-consecutive-wins.reducer:${parameters.trackedPlayerId}' },
        initialState: { count: 0 },
        transitions: [
          {
            when: {
              kind: 'all', values: [
                { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['type'] }, right: { kind: 'literal', value: 'hand.ended' } },
                {
                  kind: 'compare', operator: 'eq',
                  left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['winnerId'] },
                  right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.trackedPlayerId' } },
                },
              ],
            },
            updates: [{
              path: ['count'],
              value: {
                kind: 'arithmetic', operator: 'add',
                left: { kind: 'path', target: { kind: 'variable', name: 'state' }, path: ['count'] },
                right: { kind: 'literal', value: 1 },
              },
            }],
          },
          {
            when: {
              kind: 'all', values: [
                { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['type'] }, right: { kind: 'literal', value: 'hand.ended' } },
                {
                  kind: 'compare', operator: 'neq',
                  left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['winnerId'] },
                  right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.trackedPlayerId' } },
                },
              ],
            },
            updates: [{ path: ['count'], value: { kind: 'literal', value: 0 } }],
          },
          {
            when: {
              kind: 'all', values: [
                {
                  kind: 'compare', operator: 'eq',
                  left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.resetOnDraw' } },
                  right: { kind: 'literal', value: true },
                },
                { kind: 'compare', operator: 'eq', left: { kind: 'path', target: { kind: 'variable', name: 'event' }, path: ['type'] }, right: { kind: 'literal', value: 'hand.drawn' } },
              ],
            },
            updates: [{ path: ['count'], value: { kind: 'literal', value: 0 } }],
          },
        ],
      },
      eligibility: {
        id: { $module: 'template', value: 'local.eight-consecutive-wins.eligible:${parameters.trackedPlayerId}' },
        variables: [],
        constraints: [{
          kind: 'all',
          values: [
            {
              kind: 'compare', operator: 'gte',
              left: { kind: 'path', target: { kind: 'variable', name: 'streak' }, path: ['count'] },
              right: { kind: 'literal', value: 8 },
            },
            {
              kind: 'any',
              values: [
                {
                  kind: 'compare', operator: 'eq',
                  left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.requireIndependentYaku' } },
                  right: { kind: 'literal', value: false },
                },
                { kind: 'compare', operator: 'gte', left: { kind: 'variable', name: 'ordinaryHan' }, right: { kind: 'literal', value: 1 } },
              ],
            },
          ],
        }],
        maxSolutions: 1,
        maxSteps: 100_000,
      },
      award: {
        contributions: [
          { dimension: 'han', operation: 'add', value: 13 },
          { dimension: 'limit', operation: 'set', value: 'yakuman' },
        ],
      },
      parameters: {
        trackedPlayerId: { $module: 'ref', path: 'parameters.trackedPlayerId' },
        resetOnDraw: { $module: 'ref', path: 'parameters.resetOnDraw' },
        requireIndependentYaku: { $module: 'ref', path: 'parameters.requireIndependentYaku' },
      },
    },
  },
];
