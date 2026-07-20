import {
  compileSemanticRegisteredContributionEvaluationModule,
  compileTransactionalFactActionModule,
  type RuleModuleDefinition,
  type SemanticQueryBinding,
  type SemanticRegisteredEligibilityRule,
  type TransactionalFactActionDefinition,
} from '@mahjongplus/world-language';
import { RIICHI_SEMANTIC_BINDING_PROFILE } from './riichiSemanticBindingProfile.js';

const RIICHI_DECLARATION_KINDS = [
  'riichi',
  'open-riichi',
  'super-riichi',
  'pon-riichi',
  'hochi',
  'tsumo-sen',
  'bunbun-riichi',
];

const SOURCE_EVENT_BINDING: SemanticQueryBinding = {
  name: 'source-event',
  domain: 'event',
  collection: { kind: 'context', field: 'events' },
  cardinality: 'one',
  where: {
    kind: 'compare',
    operator: 'eq',
    left: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'id' },
    right: { kind: 'context', field: 'source-exposure' },
  },
};

const SOURCE_TILE_BINDING: SemanticQueryBinding = {
  name: 'source-tile',
  domain: 'tile',
  collection: { kind: 'context', field: 'tiles' },
  cardinality: 'one',
  where: {
    kind: 'compare',
    operator: 'eq',
    left: { kind: 'binding', binding: 'source-tile', domain: 'tile', field: 'id' },
    right: { kind: 'context', field: 'source-entity' },
  },
};

export const IX3_FIRST_TEN_REGISTERED_RULES: SemanticRegisteredEligibilityRule[] = [
  {
    id: 'local.special-dora',
    title: '特殊ドラ（見立てドラ）',
    query: { where: { kind: 'boolean', value: true } },
    contributions: [{
      dimension: 'han',
      operation: 'add',
      value: {
        kind: 'aggregate',
        operator: 'count',
        collection: { kind: 'context', field: 'tiles' },
        bind: 'designated-tile',
        domain: 'tile',
        where: {
          kind: 'contains',
          collection: { kind: 'module-parameter', name: 'specialDoraFaces' },
          value: { kind: 'binding', binding: 'designated-tile', domain: 'tile', field: 'face' },
        },
      },
      stage: 'tile-effects',
    }],
    qualification: { amount: 0, stage: 'tile-effects' },
  },
  {
    id: 'local.pon-riichi',
    title: 'ポン立直',
    query: {
      bindings: [SOURCE_EVENT_BINDING],
      where: {
        kind: 'exists',
        bind: 'declaration',
        domain: 'event',
        collection: { kind: 'context', field: 'events' },
        eventClass: 'declaration-published',
        where: {
          kind: 'all',
          values: [
            {
              kind: 'compare', operator: 'eq',
              left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'actor' },
              right: { kind: 'context', field: 'actor' },
            },
            {
              kind: 'compare', operator: 'eq',
              left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'declaration-kind' },
              right: { kind: 'literal', value: 'pon-riichi' },
            },
            {
              kind: 'compare', operator: 'lte',
              left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'revision' },
              right: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'revision' },
            },
          ],
        },
      },
    },
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.hochi',
    title: '報知（ホーチ）',
    query: {
      bindings: [SOURCE_EVENT_BINDING],
      where: {
        kind: 'exists', bind: 'declaration', domain: 'event',
        collection: { kind: 'context', field: 'events' },
        eventClass: 'declaration-published',
        where: {
          kind: 'all', values: [
            { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
            { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'declaration-kind' }, right: { kind: 'literal', value: 'hochi' } },
            { kind: 'compare', operator: 'lte', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'revision' }, right: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'revision' } },
          ],
        },
      },
    },
    contributions: [{ dimension: 'han', operation: 'add', value: 2, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.tsumo-sen',
    title: '自摸セン',
    sourceModes: ['direct'],
    query: {
      bindings: [SOURCE_EVENT_BINDING],
      where: {
        kind: 'exists', bind: 'declaration', domain: 'event',
        collection: { kind: 'context', field: 'events' },
        eventClass: 'declaration-published',
        where: {
          kind: 'all', values: [
            { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
            { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'declaration-kind' }, right: { kind: 'literal', value: 'tsumo-sen' } },
            { kind: 'compare', operator: 'lte', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'revision' }, right: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'revision' } },
          ],
        },
      },
    },
    contributions: [{ dimension: 'han', operation: 'add', value: 2, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.bunbun-riichi',
    title: 'ブンブン立直',
    sourceModes: ['direct'],
    query: {
      bindings: [SOURCE_EVENT_BINDING],
      where: {
        kind: 'exists', bind: 'declaration', domain: 'event',
        collection: { kind: 'context', field: 'events' },
        eventClass: 'declaration-published',
        where: {
          kind: 'all', values: [
            { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
            { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'declaration-kind' }, right: { kind: 'literal', value: 'bunbun-riichi' } },
            { kind: 'compare', operator: 'lte', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'revision' }, right: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'revision' } },
          ],
        },
      },
    },
    contributions: [{ dimension: 'han', operation: 'add', value: 3, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.tsubame-gaeshi',
    title: '燕返し',
    sourceModes: ['response'],
    query: {
      bindings: [SOURCE_EVENT_BINDING],
      where: {
        kind: 'all', values: [
          { kind: 'compare', operator: 'eq', left: { kind: 'context', field: 'source-mode' }, right: { kind: 'literal', value: 'response' } },
          {
            kind: 'exists', bind: 'declaration', domain: 'event',
            collection: { kind: 'context', field: 'events' },
            eventClass: 'declaration-published',
            where: {
              kind: 'all', values: [
                { kind: 'compare', operator: 'neq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
                { kind: 'contains', collection: { kind: 'literal', value: RIICHI_DECLARATION_KINDS }, value: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'declaration-kind' } },
                {
                  kind: 'any', values: [
                    { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'cause-action' }, right: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'cause-action' } },
                    { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'discard-event' }, right: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'id' } },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.kakikomi',
    title: '書込',
    sourceModes: ['direct'],
    query: {
      bindings: [SOURCE_EVENT_BINDING, SOURCE_TILE_BINDING],
      where: {
        kind: 'all', values: [
          { kind: 'compare', operator: 'eq', left: { kind: 'context', field: 'source-mode' }, right: { kind: 'literal', value: 'direct' } },
          { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'source-tile', domain: 'tile', field: 'face' }, right: { kind: 'literal', value: 'z5' } },
          {
            kind: 'exists', bind: 'declaration', domain: 'event',
            collection: { kind: 'context', field: 'events' },
            eventClass: 'declaration-published',
            where: {
              kind: 'all', values: [
                { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
                { kind: 'contains', collection: { kind: 'literal', value: RIICHI_DECLARATION_KINDS }, value: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'declaration-kind' } },
                { kind: 'compare', operator: 'lt', left: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'revision' }, right: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'revision' } },
                {
                  kind: 'not', value: {
                    kind: 'exists', bind: 'intervening-call', domain: 'event',
                    collection: { kind: 'context', field: 'events' },
                    eventClass: 'call-committed',
                    where: {
                      kind: 'all', values: [
                        { kind: 'compare', operator: 'gt', left: { kind: 'binding', binding: 'intervening-call', domain: 'event', field: 'revision' }, right: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'revision' } },
                        { kind: 'compare', operator: 'lt', left: { kind: 'binding', binding: 'intervening-call', domain: 'event', field: 'revision' }, right: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'revision' } },
                      ],
                    },
                  },
                },
                {
                  kind: 'not', value: {
                    kind: 'exists', bind: 'earlier-own-draw', domain: 'event',
                    collection: { kind: 'context', field: 'events' },
                    eventClass: 'tile-drawn',
                    where: {
                      kind: 'all', values: [
                        { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'earlier-own-draw', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
                        { kind: 'compare', operator: 'gt', left: { kind: 'binding', binding: 'earlier-own-draw', domain: 'event', field: 'revision' }, right: { kind: 'binding', binding: 'declaration', domain: 'event', field: 'revision' } },
                        { kind: 'compare', operator: 'lt', left: { kind: 'binding', binding: 'earlier-own-draw', domain: 'event', field: 'revision' }, right: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'revision' } },
                      ],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.no-chi-no-pon',
    title: '不吃不ポン',
    query: {
      where: {
        kind: 'all', values: [
          { kind: 'compare', operator: 'eq', left: { kind: 'context', field: 'closed' }, right: { kind: 'literal', value: true } },
          { kind: 'contains', collection: { kind: 'module-parameter', name: 'noCallCommitmentActorIds' }, value: { kind: 'context', field: 'actor' } },
          {
            kind: 'not', value: {
              kind: 'exists', bind: 'call', domain: 'event',
              collection: { kind: 'context', field: 'events' },
              eventClass: 'call-committed',
              where: { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'call', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
            },
          },
        ],
      },
    },
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.pon-chi-kan-ron',
    title: 'ポンチーカンロン',
    sourceModes: ['response'],
    query: {
      bindings: [SOURCE_EVENT_BINDING],
      where: {
        kind: 'all', values: [
          { kind: 'compare', operator: 'eq', left: { kind: 'context', field: 'source-mode' }, right: { kind: 'literal', value: 'response' } },
          {
            kind: 'event-sequence',
            before: { kind: 'binding', binding: 'source-event', domain: 'event', field: 'revision' },
            steps: [
              { bind: 'pon', eventClass: 'meld-committed', where: { kind: 'all', values: [
                { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'pon', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
                { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'pon', domain: 'event', field: 'call-kind' }, right: { kind: 'literal', value: 'pon' } },
              ] } },
              { bind: 'chi', eventClass: 'meld-committed', where: { kind: 'all', values: [
                { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'chi', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
                { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'chi', domain: 'event', field: 'call-kind' }, right: { kind: 'literal', value: 'chi' } },
              ] } },
              { bind: 'kan', eventClass: 'meld-committed', where: { kind: 'all', values: [
                { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'kan', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
                { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'kan', domain: 'event', field: 'call-kind' }, right: { kind: 'literal', value: 'open-kan' } },
              ] } },
            ],
          },
        ],
      },
    },
    contributions: [{ dimension: 'han', operation: 'add', value: 1, stage: 'base-yaku' }],
    qualification: { amount: 1, stage: 'base-yaku' },
  },
  {
    id: 'local.dora-ho',
    title: 'ドラ和',
    query: {
      bindings: [SOURCE_TILE_BINDING],
      where: {
        kind: 'all', values: [
          { kind: 'contains', collection: { kind: 'module-parameter', name: 'activeDoraFaces' }, value: { kind: 'binding', binding: 'source-tile', domain: 'tile', field: 'face' } },
          { kind: 'position', entity: { kind: 'context', field: 'source-entity' }, state: { kind: 'literal', value: 'occupied' } },
        ],
      },
    },
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
  defaults: { specialDoraFaces: [], activeDoraFaces: [], noCallCommitmentActorIds: [] },
};

export const IX3_FIRST_TEN_RESPONSE_EVALUATION_MODULE =
  compileSemanticRegisteredContributionEvaluationModule({
    id: 'service.ix3-first-ten-response-evaluation', version: '2.0.0',
    title: 'ix3 local yaku 1–10 response evaluation',
    semanticProfile: RIICHI_SEMANTIC_BINDING_PROFILE,
    sourceMode: 'response',
    interpretationTrackId: 'track:hand-interpretations',
    fixedContextTrackId: 'track:fixed-meld-interpretation-contexts',
    waitTrackId: 'track:wait-classifications',
    rules: IX3_FIRST_TEN_REGISTERED_RULES,
    stageOrder: ['base-yaku', 'tile-effects', 'qualification'],
    qualificationStage: 'qualification', minimumQualification: 1,
    contributionTrackId: 'track:ix3-first-ten-response-contributions',
    qualificationTrackId: 'track:ix3-first-ten-response-qualifications',
    evaluationActionId: 'evaluation.evaluate-ix3-first-ten-response',
    qualificationActionId: 'evaluation.qualify-ix3-first-ten-response',
    shapeRelationTypes: ['has-hand-shape'], qualifiedRelationType: 'can-win-on',
    parameters: evaluationParameters,
  });

export const IX3_FIRST_TEN_DIRECT_EVALUATION_MODULE =
  compileSemanticRegisteredContributionEvaluationModule({
    id: 'service.ix3-first-ten-direct-evaluation', version: '2.0.0',
    title: 'ix3 local yaku 1–10 direct evaluation',
    semanticProfile: RIICHI_SEMANTIC_BINDING_PROFILE,
    sourceMode: 'direct',
    interpretationTrackId: 'track:direct-hand-interpretations',
    fixedContextTrackId: 'track:direct-fixed-meld-contexts',
    waitTrackId: 'track:direct-wait-classifications',
    rules: IX3_FIRST_TEN_REGISTERED_RULES,
    stageOrder: ['base-yaku', 'tile-effects', 'qualification'],
    qualificationStage: 'qualification', minimumQualification: 1,
    contributionTrackId: 'track:ix3-first-ten-direct-contributions',
    qualificationTrackId: 'track:ix3-first-ten-direct-qualifications',
    evaluationActionId: 'evaluation.evaluate-ix3-first-ten-direct',
    qualificationActionId: 'evaluation.qualify-ix3-first-ten-direct',
    shapeRelationTypes: ['has-hand-shape'], qualifiedRelationType: 'can-win-on',
    parameters: evaluationParameters,
  });

const noExistingDeclaration = {
  kind: 'not' as const,
  value: {
    kind: 'exists' as const, bind: 'existing-declaration', domain: 'event' as const,
    collection: { kind: 'context' as const, field: 'events' },
    eventClass: 'declaration-published',
    where: { kind: 'compare' as const, operator: 'eq' as const,
      left: { kind: 'binding' as const, binding: 'existing-declaration', domain: 'event' as const, field: 'actor' },
      right: { kind: 'context' as const, field: 'actor' } },
  },
};

const playerEligible = {
  kind: 'exists' as const, bind: 'player', domain: 'entity' as const,
  collection: { kind: 'world' as const, field: 'entities' as const },
  where: { kind: 'all' as const, values: [
    { kind: 'compare' as const, operator: 'eq' as const, left: { kind: 'binding' as const, binding: 'player', domain: 'entity' as const, field: 'id' }, right: { kind: 'context' as const, field: 'actor' } },
    { kind: 'compare' as const, operator: 'eq' as const, left: { kind: 'binding' as const, binding: 'player', domain: 'entity' as const, field: 'riichi-eligible' }, right: { kind: 'literal' as const, value: true } },
  ] },
};

const commonFactFields = (ruleId: string, declarationType: string) => ({
  correlationId: { kind: 'context', field: 'action-entity' } as const,
  sourceRuleId: { kind: 'literal', value: ruleId } as const,
  actorId: { kind: 'context', field: 'actor' } as const,
  declarationType: { kind: 'literal', value: declarationType } as const,
  state: { kind: 'literal', value: 'published' } as const,
  lifetime: { kind: 'literal', value: 'until-hand-end' } as const,
});

const declarationActions: TransactionalFactActionDefinition[] = [
  {
    id: 'declare-pon-riichi',
    requirements: [{ id: 'declare-pon-riichi.turn', kind: 'procedure-token', procedureId: 'turn', nodeId: 'await-discard', owner: 'actor', message: 'Pon riichi must be declared before the post-pon discard.' }],
    eligibility: { where: { kind: 'all', values: [
      noExistingDeclaration,
      { kind: 'exists', bind: 'recent-pon', domain: 'event', collection: { kind: 'context', field: 'events' }, eventClass: 'meld-committed', where: { kind: 'all', values: [
        { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'recent-pon', domain: 'event', field: 'actor' }, right: { kind: 'context', field: 'actor' } },
        { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'recent-pon', domain: 'event', field: 'call-kind' }, right: { kind: 'literal', value: 'pon' } },
        { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'recent-pon', domain: 'event', field: 'revision' }, right: { kind: 'arithmetic', operator: 'subtract', left: { kind: 'context', field: 'revision' }, right: { kind: 'literal', value: 1 } } },
      ] } },
    ] } },
    transfers: [{ ledger: 'ledgerId', from: { kind: 'context', field: 'actor' }, to: { kind: 'literal', value: 'riichi-pot' }, amount: { kind: 'module-parameter', name: 'ponRiichiStake' } }],
    appendFacts: [
      { trackId: 'track:ix3-resource-transfers', fields: { ...commonFactFields('local:pon-riichi', 'pon-riichi-transfer'), fromAccountId: { kind: 'context', field: 'actor' }, toAccountId: { kind: 'literal', value: 'riichi-pot' }, amount: { kind: 'module-parameter', name: 'ponRiichiStake' } } },
      { trackId: 'track:ix3-local-declarations', fields: commonFactFields('local:pon-riichi', 'pon-riichi') },
      { trackId: 'track:ix3-declaration-privileges', fields: { ...commonFactFields('local:pon-riichi', 'pon-riichi-privileges'), uraDora: { kind: 'literal', value: false }, ippatsu: { kind: 'literal', value: false }, exclusiveGroup: { kind: 'literal', value: 'riichi-declaration' } } },
    ],
    events: [{ eventClass: 'declaration-published', payload: { 'declaration-kind': { kind: 'literal', value: 'pon-riichi' } } }],
  },
  {
    id: 'declare-hochi', parameters: { waitEvidenceId: 'string', waitForm: 'string' },
    inputSchema: { type: 'object', properties: { waitEvidenceId: { type: 'string', minLength: 1 }, waitForm: { type: 'string', minLength: 1 } }, required: ['waitEvidenceId', 'waitForm'], additionalProperties: false },
    eligibility: { where: { kind: 'all', values: [
      noExistingDeclaration,
      playerEligible,
      { kind: 'exists', bind: 'wait-relation', domain: 'relation', collection: { kind: 'world', field: 'relations' }, where: { kind: 'all', values: [
        { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'wait-relation', domain: 'relation', field: 'type' }, right: { kind: 'module-binding', name: 'singleWaitRelationType' } },
        { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'wait-relation', domain: 'relation', field: 'source-id' }, right: { kind: 'context', field: 'actor' } },
        { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'wait-relation', domain: 'relation', field: 'target-id' }, right: { kind: 'action-parameter', name: 'waitEvidenceId' } },
      ] } },
    ] } },
    transfers: [{ ledger: 'ledgerId', from: { kind: 'context', field: 'actor' }, to: { kind: 'literal', value: 'riichi-pot' }, amount: { kind: 'module-parameter', name: 'hochiFee' } }],
    appendFacts: [
      { trackId: 'track:ix3-resource-transfers', fields: { ...commonFactFields('local:hochi', 'hochi-transfer'), fromAccountId: { kind: 'context', field: 'actor' }, toAccountId: { kind: 'literal', value: 'riichi-pot' }, amount: { kind: 'module-parameter', name: 'hochiFee' } } },
      { trackId: 'track:ix3-local-declarations', fields: commonFactFields('local:hochi', 'hochi') },
      { trackId: 'track:ix3-local-declarations', fields: { ...commonFactFields('local:hochi', 'hochi-wait'), waitEvidenceId: { kind: 'action-parameter', name: 'waitEvidenceId' }, waitForm: { kind: 'action-parameter', name: 'waitForm' } } },
    ],
    events: [{ eventClass: 'declaration-published', payload: { 'declaration-kind': { kind: 'literal', value: 'hochi' }, 'wait-evidence': { kind: 'parameter', name: 'waitEvidenceId' }, 'wait-form': { kind: 'parameter', name: 'waitForm' } } }],
  },
  {
    id: 'declare-tsumo-sen',
    eligibility: { where: { kind: 'all', values: [noExistingDeclaration, playerEligible] } },
    transfers: [{ ledger: 'ledgerId', from: { kind: 'context', field: 'actor' }, to: { kind: 'literal', value: 'riichi-pot' }, amount: { kind: 'module-parameter', name: 'tsumoSenStake' } }],
    appendFacts: [
      { trackId: 'track:ix3-resource-transfers', fields: { ...commonFactFields('local:tsumo-sen', 'tsumo-sen-transfer'), fromAccountId: { kind: 'context', field: 'actor' }, toAccountId: { kind: 'literal', value: 'riichi-pot' }, amount: { kind: 'module-parameter', name: 'tsumoSenStake' } } },
      { trackId: 'track:ix3-local-declarations', fields: commonFactFields('local:tsumo-sen', 'tsumo-sen') },
      { trackId: 'track:ix3-win-source-policies', fields: { ...commonFactFields('local:tsumo-sen', 'tsumo-sen-source-policy'), subjectId: { kind: 'context', field: 'actor' }, allowedModes: { kind: 'literal', value: ['direct'] }, state: { kind: 'literal', value: 'active' } } },
    ],
    events: [{ eventClass: 'declaration-published', payload: { 'declaration-kind': { kind: 'literal', value: 'tsumo-sen' } } }],
  },
  {
    id: 'declare-bunbun-riichi',
    eligibility: { where: { kind: 'all', values: [noExistingDeclaration, playerEligible] } },
    transfers: [{ ledger: 'ledgerId', from: { kind: 'context', field: 'actor' }, to: { kind: 'literal', value: 'riichi-pot' }, amount: { kind: 'module-parameter', name: 'bunbunStake' } }],
    appendFacts: [
      { trackId: 'track:ix3-resource-transfers', fields: { ...commonFactFields('local:bunbun-riichi', 'bunbun-transfer'), fromAccountId: { kind: 'context', field: 'actor' }, toAccountId: { kind: 'literal', value: 'riichi-pot' }, amount: { kind: 'module-parameter', name: 'bunbunStake' } } },
      { trackId: 'track:ix3-local-declarations', fields: commonFactFields('local:bunbun-riichi', 'bunbun-riichi') },
      { trackId: 'track:ix3-win-source-policies', fields: { ...commonFactFields('local:bunbun-riichi', 'bunbun-source-policy'), subjectId: { kind: 'context', field: 'actor' }, allowedModes: { kind: 'literal', value: ['direct'] }, state: { kind: 'literal', value: 'active' } } },
      { trackId: 'track:ix3-visibility-policies', fields: { ...commonFactFields('local:bunbun-riichi', 'bunbun-visibility'), subjectId: { kind: 'context', field: 'actor' }, audience: { kind: 'literal', value: 'all' }, scope: { kind: 'literal', value: 'hand' }, state: { kind: 'literal', value: 'active' } } },
    ],
    events: [{ eventClass: 'declaration-published', payload: { 'declaration-kind': { kind: 'literal', value: 'bunbun-riichi' } } }],
  },
];

export const IX3_FIRST_TEN_DECLARATION_MODULE: RuleModuleDefinition =
  compileTransactionalFactActionModule({
    id: 'rule.ix3-first-ten-declarations', version: '2.0.0',
    title: 'ix3 local declaration roles 2–5',
    semanticProfile: RIICHI_SEMANTIC_BINDING_PROFILE,
    parameters: {
      schema: { type: 'object', properties: {
        ponRiichiStake: { type: 'number', integer: true, minimum: 0 },
        hochiFee: { type: 'number', integer: true, minimum: 0 },
        tsumoSenStake: { type: 'number', integer: true, minimum: 0 },
        bunbunStake: { type: 'number', integer: true, minimum: 0 },
      }, required: ['ponRiichiStake', 'hochiFee', 'tsumoSenStake', 'bunbunStake'], additionalProperties: false },
      defaults: { ponRiichiStake: 1000, hochiFee: 3000, tsumoSenStake: 1000, bunbunStake: 1000 },
    },
    requiredBindings: ['ledgerId', 'singleWaitRelationType'],
    ledgers: [{ binding: 'ledgerId' }],
    tracks: [
      { id: 'track:ix3-resource-transfers', factType: 'resource-transfer' },
      { id: 'track:ix3-local-declarations', factType: 'public-declaration' },
      { id: 'track:ix3-win-source-policies', factType: 'win-source-policy' },
      { id: 'track:ix3-declaration-privileges', factType: 'declaration-privilege-policy' },
      { id: 'track:ix3-visibility-policies', factType: 'visibility-policy' },
    ],
    actions: declarationActions,
    gates: [
      {
        id: 'ron.ix3-win-source-policy', actionId: 'ron',
        message: 'An active declaration restricts this player to direct/self-draw wins.',
        allow: { where: { kind: 'not', value: {
          kind: 'exists', bind: 'policy-track', domain: 'entity', collection: { kind: 'world', field: 'entities' },
          where: { kind: 'all', values: [
            { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'policy-track', domain: 'entity', field: 'id' }, right: { kind: 'literal', value: 'track:ix3-win-source-policies' } },
            { kind: 'exists', bind: 'policy', domain: 'record', collection: { kind: 'binding', binding: 'policy-track', domain: 'entity', field: 'fact-records' }, where: { kind: 'all', values: [
              { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'policy', domain: 'record', field: 'subject-id' }, right: { kind: 'context', field: 'actor' } },
              { kind: 'compare', operator: 'eq', left: { kind: 'binding', binding: 'policy', domain: 'record', field: 'state' }, right: { kind: 'literal', value: 'active' } },
              { kind: 'not', value: { kind: 'contains', collection: { kind: 'binding', binding: 'policy', domain: 'record', field: 'allowed-modes' }, value: { kind: 'literal', value: 'response' } } },
            ] } },
          ] },
        } } },
      },
      {
        id: 'declare-riichi.no-ix3-exclusive', actionId: 'declare-riichi',
        message: 'A mutually exclusive declaration already exists.',
        allow: { where: noExistingDeclaration },
      },
    ],
    metadata: {
      sourcePage: 'http://www.ix3.jp/hiii/02mahken/1-10-1local.htm',
      sourceOrder: [2, 3, 4, 5],
      semanticDataOnly: true,
    },
  });

export const IX3_FIRST_TEN_MODULES: RuleModuleDefinition[] = [
  IX3_FIRST_TEN_DECLARATION_MODULE,
  IX3_FIRST_TEN_RESPONSE_EVALUATION_MODULE,
  IX3_FIRST_TEN_DIRECT_EVALUATION_MODULE,
];

export const IX3_FIRST_TEN_IMPLEMENTATION_STATUS = [
  { order: 1, id: 'local.special-dora', status: 'implemented', mechanism: 'semantic tile-set binding plus expression-valued count; qualification zero' },
  { order: 2, id: 'local.pon-riichi', status: 'implemented', mechanism: 'semantic recent-call binding plus generic transactional fact action' },
  { order: 3, id: 'local.hochi', status: 'implemented-with-evidence-binding', mechanism: 'semantic relation binding, ledger transfer and public wait facts' },
  { order: 4, id: 'local.tsumo-sen', status: 'implemented', mechanism: 'generic source-policy fact and generic action gate' },
  { order: 5, id: 'local.bunbun-riichi', status: 'implemented', mechanism: 'generic visibility and source-policy facts' },
  { order: 6, id: 'local.tsubame-gaeshi', status: 'implemented', mechanism: 'editable event-class and causal-action bindings' },
  { order: 7, id: 'local.kakikomi', status: 'implemented', mechanism: 'named source event/tile bindings and interval event exclusions' },
  { order: 8, id: 'local.no-chi-no-pon', status: 'implemented', mechanism: 'profile commitment data plus generic call-event class absence' },
  { order: 9, id: 'local.pon-chi-kan-ron', status: 'implemented', mechanism: 'generic event-sequence binding' },
  { order: 10, id: 'local.dora-ho', status: 'implemented', mechanism: 'source tile attribute plus generic physical position query' },
] as const;
