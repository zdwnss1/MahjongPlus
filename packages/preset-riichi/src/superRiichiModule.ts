import type { RuleModuleDefinition } from '@mahjongplus/world-language';

const mode = { kind: 'path', target: { kind: 'variable', name: 'params' }, path: ['mode'] };
const isSuper = { kind: 'compare', operator: 'eq', left: mode, right: { kind: 'literal', value: 'super' } };
const world = { kind: 'variable', name: 'world' };
const entities = { kind: 'path', target: world, path: ['entities'] };
const zones = { kind: 'path', target: world, path: ['zones'] };
const ledgerIndex = { $module: 'entity-index', id: { $module: 'ref', path: 'bindings.ledgerId' } };
const indicatorIndex = { $module: 'entity-index', id: 'track:dora-indicators' };
const liveZoneIndex = { $module: 'zone-index', id: { $module: 'ref', path: 'bindings.liveZoneId' } };
const deadZoneIndex = { $module: 'zone-index', id: { $module: 'ref', path: 'bindings.deadZoneId' } };
const accounts = { kind: 'path', target: entities, path: [ledgerIndex, 'components', 'ledger', 'accounts'] };
const actorAccount = {
  kind: 'path',
  target: {
    kind: 'filter', source: accounts, as: 'account',
    where: {
      kind: 'compare', operator: 'eq',
      left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] },
      right: { kind: 'variable', name: 'actorId' },
    },
  },
  path: ['0'],
};
const player = {
  kind: 'path',
  target: {
    kind: 'filter', source: entities, as: 'entity',
    where: {
      kind: 'compare', operator: 'eq',
      left: { kind: 'path', target: { kind: 'variable', name: 'entity' }, path: ['id'] },
      right: { kind: 'variable', name: 'actorId' },
    },
  },
  path: ['0'],
};
const revealTrack = { kind: 'path', target: entities, path: [indicatorIndex, 'components', 'revealTrack'] };
const revealedCount = { kind: 'path', target: revealTrack, path: ['revealedCount'] };
const declaredActors = { kind: 'path', target: revealTrack, path: ['declaredActors'] };
const liveEntries = { kind: 'path', target: zones, path: [liveZoneIndex, 'entries'] };
const deadEntries = { kind: 'path', target: zones, path: [deadZoneIndex, 'entries'] };
const pointCost = {
  kind: 'if', condition: isSuper,
  then: { kind: 'literal', value: { $module: 'ref', path: 'parameters.superStake' } },
  else: { kind: 'literal', value: { $module: 'ref', path: 'parameters.standardStake' } },
};
const unboundedSuper = {
  kind: 'all',
  values: [
    isSuper,
    {
      kind: 'compare', operator: 'eq',
      left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.indicatorPolicy' } },
      right: { kind: 'literal', value: 'unbounded-extend' },
    },
  ],
};
const cutoff = {
  kind: 'arithmetic', operator: 'subtract',
  left: { kind: 'aggregate', operator: 'count', source: liveEntries },
  right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.extensionTilesPerUse' } },
};
const movedEntries = {
  kind: 'filter', source: liveEntries, as: 'entry',
  where: {
    kind: 'compare', operator: 'gte',
    left: { kind: 'path', target: { kind: 'variable', name: 'entry' }, path: ['ordinal'] },
    right: cutoff,
  },
};
const retainedEntries = {
  kind: 'filter', source: liveEntries, as: 'entry',
  where: {
    kind: 'compare', operator: 'lt',
    left: { kind: 'path', target: { kind: 'variable', name: 'entry' }, path: ['ordinal'] },
    right: cutoff,
  },
};
const standardIndicatorIds = {
  kind: 'map',
  source: {
    kind: 'filter',
    source: { kind: 'path', target: revealTrack, path: ['candidates'] },
    as: 'candidate',
    where: {
      kind: 'all',
      values: [
        {
          kind: 'compare', operator: 'gte',
          left: { kind: 'path', target: { kind: 'variable', name: 'candidate' }, path: ['ordinal'] },
          right: revealedCount,
        },
        {
          kind: 'compare', operator: 'lt',
          left: { kind: 'path', target: { kind: 'variable', name: 'candidate' }, path: ['ordinal'] },
          right: {
            kind: 'arithmetic', operator: 'add', left: revealedCount,
            right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.extraIndicatorsPerUse' } },
          },
        },
      ],
    },
  },
  as: 'candidate',
  select: { kind: 'path', target: { kind: 'variable', name: 'candidate' }, path: ['tileId'] },
};
const extendedIndicatorIds = {
  kind: 'map',
  source: {
    kind: 'filter', source: movedEntries, as: 'entry',
    where: {
      kind: 'compare', operator: 'eq',
      left: {
        kind: 'arithmetic', operator: 'modulo',
        left: {
          kind: 'arithmetic', operator: 'subtract',
          left: { kind: 'path', target: { kind: 'variable', name: 'entry' }, path: ['ordinal'] },
          right: cutoff,
        },
        right: {
          kind: 'arithmetic', operator: 'divide',
          left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.extensionTilesPerUse' } },
          right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.extraIndicatorsPerUse' } },
        },
      },
      right: { kind: 'literal', value: 0 },
    },
  },
  as: 'entry',
  select: { kind: 'path', target: { kind: 'variable', name: 'entry' }, path: ['entityId'] },
};
const newIndicatorIds = {
  kind: 'if',
  condition: {
    kind: 'compare', operator: 'eq',
    left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.indicatorPolicy' } },
    right: { kind: 'literal', value: 'standard-cap' },
  },
  then: standardIndicatorIds,
  else: extendedIndicatorIds,
};
const newRevealRecords = {
  kind: 'map', source: newIndicatorIds, as: 'tileId',
  select: {
    kind: 'record',
    fields: {
      tileId: { kind: 'variable', name: 'tileId' },
      audience: { kind: 'literal', value: 'all' },
      source: { kind: 'literal', value: 'super-riichi' },
      correlationId: { kind: 'variable', name: 'actionEntityId' },
    },
  },
};
const factBase = {
  correlationId: { kind: 'variable', name: 'actionEntityId' },
  sourceRuleId: { kind: 'literal', value: 'rule:super-riichi' },
  actorId: { kind: 'variable', name: 'actorId' },
  mode,
};

export const SUPER_RIICHI_MODULE: RuleModuleDefinition = {
  id: 'rule.super-riichi',
  version: '1.0.0',
  title: 'Super立直',
  description: 'A parameterized declaration mode with independent stake, score, discard, furiten and reveal facts.',
  parameters: {
    schema: {
      type: 'object',
      properties: {
        ownerId: { type: 'string', minLength: 1 },
        scope: { type: 'string', enum: ['global', 'owner-only'] },
        indicatorPolicy: { type: 'string', enum: ['standard-cap', 'unbounded-extend'] },
        standardStake: { type: 'number', integer: true, minimum: 0 },
        superStake: { type: 'number', integer: true, minimum: 1 },
        riichiHan: { type: 'number', integer: true, minimum: 0 },
        extraIndicatorsPerUse: { type: 'number', integer: true, minimum: 1 },
        standardExtraIndicatorCap: { type: 'number', integer: true, minimum: 1 },
        extensionTilesPerUse: { type: 'number', integer: true, minimum: 1 },
      },
      required: [
        'ownerId', 'scope', 'indicatorPolicy', 'standardStake', 'superStake', 'riichiHan',
        'extraIndicatorsPerUse', 'standardExtraIndicatorCap', 'extensionTilesPerUse',
      ],
      additionalProperties: false,
    },
    defaults: {
      ownerId: 'east',
      scope: 'global',
      indicatorPolicy: 'standard-cap',
      standardStake: 1000,
      superStake: 5000,
      riichiHan: 1,
      extraIndicatorsPerUse: 2,
      standardExtraIndicatorCap: 4,
      extensionTilesPerUse: 4,
    },
  },
  requiredBindings: ['ledgerId', 'liveZoneId', 'deadZoneId', 'indicatorCandidates'],
  additions: {
    entities: [
      {
        id: 'track:dora-indicators', kind: 'reveal-track',
        components: {
          revealTrack: {
            channelId: 'dora', public: true, revealedCount: 0,
            capacity: { $module: 'ref', path: 'parameters.standardExtraIndicatorCap' },
            revealed: [],
            candidates: { $module: 'ref', path: 'bindings.indicatorCandidates' },
            declaredActors: [],
          },
        },
      },
      { id: 'track:resource-transfers', kind: 'fact-track', components: { factTrack: { factType: 'resource-transfer', records: [] } } },
      { id: 'track:public-declarations', kind: 'fact-track', components: { factTrack: { factType: 'public-declaration', records: [] } } },
      { id: 'track:score-contributions', kind: 'fact-track', components: { factTrack: { factType: 'score-contribution', records: [] } } },
      { id: 'track:discard-policies', kind: 'fact-track', components: { factTrack: { factType: 'discard-policy', records: [] } } },
      { id: 'track:furiten-policies', kind: 'fact-track', components: { factTrack: { factType: 'furiten-policy', records: [] } } },
      {
        id: 'rule:super-riichi', kind: 'rule-instance',
        components: {
          rulePolicy: {
            ownerId: { $module: 'ref', path: 'parameters.ownerId' },
            scope: { $module: 'ref', path: 'parameters.scope' },
            indicatorPolicy: { $module: 'ref', path: 'parameters.indicatorPolicy' },
            standardStake: { $module: 'ref', path: 'parameters.standardStake' },
            superStake: { $module: 'ref', path: 'parameters.superStake' },
            riichiHan: { $module: 'ref', path: 'parameters.riichiHan' },
            extraIndicatorsPerUse: { $module: 'ref', path: 'parameters.extraIndicatorsPerUse' },
            standardExtraIndicatorCap: { $module: 'ref', path: 'parameters.standardExtraIndicatorCap' },
            extensionTilesPerUse: { $module: 'ref', path: 'parameters.extensionTilesPerUse' },
          },
        },
      },
    ],
    actions: [{
      id: 'declare-riichi',
      parameters: { mode: 'string' },
      requirements: [{
        id: 'declare-riichi.core-eligibility', kind: 'core.constraint',
        programId: 'super-riichi.action-eligible',
        message: 'The selected declaration mode is unavailable in the current world state.',
      }],
      effects: [
        { kind: 'core.rewrite', programId: 'super-riichi.commit' },
        {
          kind: 'event.emit', eventType: 'resource.transferred', subjects: [{ kind: 'actor' }],
          objects: [
            { kind: 'entity', entityKind: 'resource-ledger', id: { kind: 'literal', value: { $module: 'ref', path: 'bindings.ledgerId' } } },
            { kind: 'entity', entityKind: 'fact-track', id: { kind: 'literal', value: 'track:resource-transfers' } },
          ],
          payload: { mode: { kind: 'context', path: 'params.mode' }, ruleId: 'rule:super-riichi' },
        },
        {
          kind: 'event.emit', eventType: 'declaration.published', subjects: [{ kind: 'actor' }],
          objects: [{ kind: 'entity', entityKind: 'fact-track', id: { kind: 'literal', value: 'track:public-declarations' } }],
          payload: { mode: { kind: 'context', path: 'params.mode' }, declarationType: 'riichi', ruleId: 'rule:super-riichi' },
        },
        {
          kind: 'event.emit', eventType: 'score-contribution.granted', subjects: [{ kind: 'actor' }],
          objects: [{ kind: 'entity', entityKind: 'fact-track', id: { kind: 'literal', value: 'track:score-contributions' } }],
          payload: { mode: { kind: 'context', path: 'params.mode' }, dimension: 'han', ruleId: 'rule:super-riichi' },
        },
        {
          kind: 'event.emit', eventType: 'discard-policy.activated', subjects: [{ kind: 'actor' }],
          objects: [{ kind: 'entity', entityKind: 'fact-track', id: { kind: 'literal', value: 'track:discard-policies' } }],
          payload: { mode: { kind: 'context', path: 'params.mode' }, ruleId: 'rule:super-riichi' },
        },
        {
          kind: 'event.emit', eventType: 'furiten-policy.activated', subjects: [{ kind: 'actor' }],
          objects: [{ kind: 'entity', entityKind: 'fact-track', id: { kind: 'literal', value: 'track:furiten-policies' } }],
          payload: { mode: { kind: 'context', path: 'params.mode' }, ruleId: 'rule:super-riichi' },
        },
        {
          kind: 'event.emit', eventType: 'reveal-track.updated', subjects: [{ kind: 'actor' }],
          objects: [{ kind: 'entity', entityKind: 'reveal-track', id: { kind: 'literal', value: 'track:dora-indicators' } }],
          payload: { mode: { kind: 'context', path: 'params.mode' }, ruleId: 'rule:super-riichi' },
        },
      ],
    }],
    corePrograms: {
      constraints: [{
        id: 'super-riichi.action-eligible',
        variables: [],
        constraints: [{
          kind: 'all',
          values: [
            { kind: 'contains', collection: { kind: 'literal', value: ['standard', 'super'] }, value: mode },
            {
              kind: 'compare', operator: 'eq',
              left: { kind: 'path', target: player, path: ['components', 'riichi', 'eligible'] },
              right: { kind: 'literal', value: true },
            },
            { kind: 'not', value: { kind: 'contains', collection: declaredActors, value: { kind: 'variable', name: 'actorId' } } },
            {
              kind: 'compare', operator: 'gte',
              left: { kind: 'path', target: actorAccount, path: ['balance'] },
              right: pointCost,
            },
            {
              kind: 'any',
              values: [
                { kind: 'compare', operator: 'eq', left: mode, right: { kind: 'literal', value: 'standard' } },
                {
                  kind: 'all',
                  values: [
                    isSuper,
                    {
                      kind: 'any',
                      values: [
                        {
                          kind: 'compare', operator: 'eq',
                          left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.scope' } },
                          right: { kind: 'literal', value: 'global' },
                        },
                        {
                          kind: 'compare', operator: 'eq',
                          left: { kind: 'variable', name: 'actorId' },
                          right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.ownerId' } },
                        },
                      ],
                    },
                    {
                      kind: 'any',
                      values: [
                        {
                          kind: 'all',
                          values: [
                            {
                              kind: 'compare', operator: 'eq',
                              left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.indicatorPolicy' } },
                              right: { kind: 'literal', value: 'standard-cap' },
                            },
                            {
                              kind: 'compare', operator: 'lte',
                              left: {
                                kind: 'arithmetic', operator: 'add', left: revealedCount,
                                right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.extraIndicatorsPerUse' } },
                              },
                              right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.standardExtraIndicatorCap' } },
                            },
                          ],
                        },
                        {
                          kind: 'all',
                          values: [
                            {
                              kind: 'compare', operator: 'eq',
                              left: { kind: 'literal', value: { $module: 'ref', path: 'parameters.indicatorPolicy' } },
                              right: { kind: 'literal', value: 'unbounded-extend' },
                            },
                            {
                              kind: 'compare', operator: 'gte',
                              left: { kind: 'aggregate', operator: 'count', source: liveEntries },
                              right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.extensionTilesPerUse' } },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }],
        maxSolutions: 1,
        maxSteps: 10_000,
      }],
      rewrites: [{
        id: 'super-riichi.commit',
        operations: [
          {
            kind: 'set', path: ['world', 'entities', ledgerIndex, 'components', 'ledger', 'accounts'],
            value: {
              kind: 'map', source: accounts, as: 'account',
              select: {
                kind: 'if',
                condition: {
                  kind: 'compare', operator: 'eq',
                  left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] },
                  right: { kind: 'variable', name: 'actorId' },
                },
                then: {
                  kind: 'record', fields: {
                    id: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] },
                    balance: {
                      kind: 'arithmetic', operator: 'subtract',
                      left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['balance'] },
                      right: pointCost,
                    },
                  },
                },
                else: {
                  kind: 'if',
                  condition: {
                    kind: 'compare', operator: 'eq',
                    left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] },
                    right: { kind: 'literal', value: 'riichi-pot' },
                  },
                  then: {
                    kind: 'record', fields: {
                      id: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['id'] },
                      balance: {
                        kind: 'arithmetic', operator: 'add',
                        left: { kind: 'path', target: { kind: 'variable', name: 'account' }, path: ['balance'] },
                        right: pointCost,
                      },
                    },
                  },
                  else: { kind: 'variable', name: 'account' },
                },
              },
            },
          },
          {
            kind: 'append',
            path: ['world', 'entities', { $module: 'entity-index', id: 'track:resource-transfers' }, 'components', 'factTrack', 'records'],
            value: {
              kind: 'record', fields: {
                ...factBase,
                asset: { kind: 'literal', value: 'points' },
                fromAccountId: { kind: 'variable', name: 'actorId' },
                toAccountId: { kind: 'literal', value: 'riichi-pot' },
                amount: pointCost,
              },
            },
          },
          {
            kind: 'append',
            path: ['world', 'entities', { $module: 'entity-index', id: 'track:public-declarations' }, 'components', 'factTrack', 'records'],
            value: {
              kind: 'record', fields: {
                ...factBase,
                declarationType: { kind: 'literal', value: 'riichi' },
                audience: { kind: 'literal', value: 'all' },
                state: { kind: 'literal', value: 'published' },
              },
            },
          },
          {
            kind: 'append',
            path: ['world', 'entities', { $module: 'entity-index', id: 'track:score-contributions' }, 'components', 'factTrack', 'records'],
            value: {
              kind: 'record', fields: {
                ...factBase,
                subjectId: { kind: 'variable', name: 'actorId' },
                dimension: { kind: 'literal', value: 'han' },
                operation: { kind: 'literal', value: 'add' },
                amount: { kind: 'literal', value: { $module: 'ref', path: 'parameters.riichiHan' } },
                stage: { kind: 'literal', value: 'base-yaku' },
                lifetime: { kind: 'literal', value: 'until-hand-end' },
              },
            },
          },
          {
            kind: 'append',
            path: ['world', 'entities', { $module: 'entity-index', id: 'track:discard-policies' }, 'components', 'factTrack', 'records'],
            value: {
              kind: 'record', fields: {
                ...factBase,
                subjectId: { kind: 'variable', name: 'actorId' },
                policyType: { kind: 'literal', value: 'discard-selection' },
                allowedSource: { kind: 'literal', value: 'latest-draw' },
                consequence: { kind: 'literal', value: 'reject' },
                lifetime: { kind: 'literal', value: 'until-hand-end' },
              },
            },
          },
          {
            kind: 'append',
            path: ['world', 'entities', { $module: 'entity-index', id: 'track:furiten-policies' }, 'components', 'factTrack', 'records'],
            value: {
              kind: 'record', fields: {
                ...factBase,
                subjectId: { kind: 'variable', name: 'actorId' },
                policyType: { kind: 'literal', value: 'missed-win-lock' },
                triggerEventType: { kind: 'literal', value: 'win-claim.passed' },
                resultingState: { kind: 'literal', value: 'furiten' },
                furitenClass: { kind: 'literal', value: 'riichi-pass' },
                lifetime: { kind: 'literal', value: 'until-hand-end' },
              },
            },
          },
          {
            kind: 'set',
            path: ['world', 'entities', indicatorIndex, 'components', 'revealTrack', 'declaredActors'],
            value: { kind: 'concat', sources: [declaredActors, { kind: 'list', items: [{ kind: 'variable', name: 'actorId' }] }] },
          },
          {
            kind: 'set',
            path: ['world', 'entities', indicatorIndex, 'components', 'revealTrack', 'revealedCount'],
            value: {
              kind: 'if', condition: isSuper,
              then: {
                kind: 'arithmetic', operator: 'add', left: revealedCount,
                right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.extraIndicatorsPerUse' } },
              },
              else: revealedCount,
            },
          },
          {
            kind: 'set',
            path: ['world', 'entities', indicatorIndex, 'components', 'revealTrack', 'capacity'],
            value: {
              kind: 'if', condition: unboundedSuper,
              then: {
                kind: 'arithmetic', operator: 'add',
                left: { kind: 'path', target: revealTrack, path: ['capacity'] },
                right: { kind: 'literal', value: { $module: 'ref', path: 'parameters.extraIndicatorsPerUse' } },
              },
              else: { kind: 'path', target: revealTrack, path: ['capacity'] },
            },
          },
          {
            kind: 'set',
            path: ['world', 'entities', indicatorIndex, 'components', 'revealTrack', 'revealed'],
            value: {
              kind: 'if', condition: isSuper,
              then: {
                kind: 'concat',
                sources: [{ kind: 'path', target: revealTrack, path: ['revealed'] }, newRevealRecords],
              },
              else: { kind: 'path', target: revealTrack, path: ['revealed'] },
            },
          },
          {
            kind: 'set', path: ['world', 'zones', liveZoneIndex, 'entries'],
            value: { kind: 'if', condition: unboundedSuper, then: retainedEntries, else: liveEntries },
          },
          {
            kind: 'set', path: ['world', 'zones', deadZoneIndex, 'entries'],
            value: {
              kind: 'if', condition: unboundedSuper,
              then: { kind: 'concat', sources: [movedEntries, deadEntries] },
              else: deadEntries,
            },
          },
        ],
      }],
    },
    metadata: {
      ruleFamily: 'declaration-mode',
      factChannels: [
        'track:resource-transfers', 'track:public-declarations', 'track:score-contributions',
        'track:discard-policies', 'track:furiten-policies', 'track:dora-indicators',
      ],
    },
  },
  artifacts: {
    actionOffer: {
      actionId: 'declare-riichi',
      inputSchema: {
        type: 'object', properties: { mode: { type: 'string', enum: ['standard', 'super'] } },
        required: ['mode'], additionalProperties: false,
      },
      choices: [
        {
          id: 'standard', label: '立直',
          preview: {
            pointCost: { $module: 'ref', path: 'parameters.standardStake' },
            extraIndicators: 0,
            han: { $module: 'ref', path: 'parameters.riichiHan' },
          },
        },
        {
          id: 'super', label: 'Super立直',
          preview: {
            pointCost: { $module: 'ref', path: 'parameters.superStake' },
            extraIndicators: { $module: 'ref', path: 'parameters.extraIndicatorsPerUse' },
            han: { $module: 'ref', path: 'parameters.riichiHan' },
            scope: { $module: 'ref', path: 'parameters.scope' },
            indicatorPolicy: { $module: 'ref', path: 'parameters.indicatorPolicy' },
            wallExtensionTiles: {
              $module: 'if',
              condition: {
                $module: 'eq',
                left: { $module: 'ref', path: 'parameters.indicatorPolicy' },
                right: 'unbounded-extend',
              },
              then: { $module: 'ref', path: 'parameters.extensionTilesPerUse' },
              else: 0,
            },
          },
        },
      ],
    },
  },
};
