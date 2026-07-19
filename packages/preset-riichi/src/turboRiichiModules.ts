import type { RuleModuleDefinition } from '@mahjongplus/world-language';

const mref = (path: string) => ({ $module: 'ref', path });
const mindex = (id: unknown) => ({ $module: 'entity-index', id });
const mmap = (source: unknown, as: string, value: unknown) => ({ $module: 'map', source, as, value });
const meq = (left: unknown, right: unknown) => ({ $module: 'eq', left, right });
const mif = (condition: unknown, thenValue: unknown, elseValue: unknown) => ({
  $module: 'if', condition, then: thenValue, else: elseValue,
});
const literal = (value: unknown) => ({ kind: 'literal', value });
const variable = (name: string) => ({ kind: 'variable', name });
const path = (target: unknown, ...parts: unknown[]) => ({ kind: 'path', target, path: parts });
const compare = (operator: string, left: unknown, right: unknown) => ({ kind: 'compare', operator, left, right });
const all = (...values: unknown[]) => ({ kind: 'all', values });
const any = (...values: unknown[]) => ({ kind: 'any', values });
const contains = (collection: unknown, value: unknown) => ({ kind: 'contains', collection, value });
const filter = (source: unknown, as: string, where: unknown) => ({ kind: 'filter', source, as, where });
const map = (source: unknown, as: string, select: unknown) => ({ kind: 'map', source, as, select });
const aggregate = (operator: string, source: unknown) => ({ kind: 'aggregate', operator, source });
const arithmetic = (operator: string, left: unknown, right: unknown) => ({ kind: 'arithmetic', operator, left, right });
const choose = (condition: unknown, thenValue: unknown, elseValue: unknown) => ({
  kind: 'if', condition, then: thenValue, else: elseValue,
});
const record = (fields: Record<string, unknown>) => ({ kind: 'record', fields });
const list = (...items: unknown[]) => ({ kind: 'list', items });
const concat = (...sources: unknown[]) => ({ kind: 'concat', sources });
const distinct = (source: unknown) => ({ kind: 'distinct', source });
const quantify = (quantifier: string, source: unknown, as: string, where: unknown) => ({
  kind: 'quantify', quantifier, source, as, where,
});

const world = variable('world');
const entities = path(world, 'entities');
const zones = path(world, 'zones');
const params = variable('params');
const chosenIds = path(params, 'tileIds');
const chosenEntities = filter(entities, 'entity', contains(chosenIds, path(variable('entity'), 'id')));
const chosenFace = path(chosenEntities, '0', 'components', 'tile', 'baseFace');
const actorEntity = path(filter(
  entities,
  'entity',
  compare('eq', path(variable('entity'), 'id'), variable('actorId')),
), '0');
const accounts = path(
  entities,
  mindex(mref('bindings.ledgerId')),
  'components',
  'ledger',
  'accounts',
);
const actorAccount = path(filter(
  accounts,
  'account',
  compare('eq', path(variable('account'), 'id'), variable('actorId')),
), '0');
const visibilityRecords = path(
  entities,
  mindex('track:visibility'),
  'components',
  'visibility',
  'records',
);
const declarationRecords = path(
  entities,
  mindex('track:declarations'),
  'components',
  'declarations',
  'records',
);
const discardPolicyRecords = path(
  entities,
  mindex('track:discard-policies'),
  'components',
  'discardPolicies',
  'records',
);
const correlationId = variable('actionEntityId');
const declarationConstraintId = 'module.turbo-declaration.eligible';
const declarationRewriteId = 'module.turbo-declaration.commit';

const declarationConstraint = {
  id: declarationConstraintId,
  variables: [],
  constraints: [all(
    compare('eq', variable('actorId'), literal(mref('parameters.declarerId'))),
    compare('eq', path(actorEntity, 'components', 'handState', 'closed'), literal(true)),
    compare('eq', aggregate('count', chosenIds), literal(3)),
    compare('eq', aggregate('count', distinct(chosenIds)), literal(3)),
    compare('eq', aggregate('count', chosenEntities), literal(3)),
    contains(literal(mref('parameters.allowedProofFaces')), chosenFace),
    quantify('forall', chosenEntities, 'tile', compare(
      'eq',
      path(variable('tile'), 'components', 'tile', 'baseFace'),
      chosenFace,
    )),
    compare('eq', aggregate('count', filter(
      visibilityRecords,
      'visibility',
      contains(chosenIds, path(variable('visibility'), 'entityId')),
    )), literal(0)),
    compare('eq', aggregate('count', declarationRecords), literal(0)),
    compare('gte', path(actorAccount, 'balance'), literal(mref('parameters.stake'))),
  )],
  maxSolutions: 1,
  maxSteps: 100_000,
};

const updatedAccounts = map(accounts, 'account', choose(
  compare('eq', path(variable('account'), 'id'), variable('actorId')),
  record({
    id: path(variable('account'), 'id'),
    balance: arithmetic('subtract', path(variable('account'), 'balance'), literal(mref('parameters.stake'))),
  }),
  choose(
    compare('eq', path(variable('account'), 'id'), literal(mref('parameters.potAccountId'))),
    record({
      id: path(variable('account'), 'id'),
      balance: arithmetic('add', path(variable('account'), 'balance'), literal(mref('parameters.stake'))),
    }),
    variable('account'),
  ),
));

const policyItems = mmap(
  mref('bindings.playerIds'),
  'playerId',
  record({
    subjectId: literal(mref('locals.playerId')),
    policyType: literal('discard-selection'),
    allowedSource: literal('latest-draw'),
    consequence: literal('reject'),
    lifetime: literal('until-hand-end'),
    source: literal(mif(
      meq(mref('locals.playerId'), mref('parameters.declarerId')),
      'riichi',
      'turbo-riichi',
    )),
    correlationId,
    sourceRuleId: literal(mref('parameters.sourceRuleId')),
  }),
);

const declarationRewrite = {
  id: declarationRewriteId,
  operations: [
    {
      kind: 'set',
      path: ['world', 'entities', mindex(mref('bindings.ledgerId')), 'components', 'ledger', 'accounts'],
      value: updatedAccounts,
    },
    {
      kind: 'set',
      path: ['world', 'entities', mindex('track:resource-transfers'), 'components', 'resourceTransfers', 'records'],
      value: concat(
        path(entities, mindex('track:resource-transfers'), 'components', 'resourceTransfers', 'records'),
        list(record({
          asset: literal('points'),
          fromAccountId: variable('actorId'),
          toAccountId: literal(mref('parameters.potAccountId')),
          amount: literal(mref('parameters.stake')),
          correlationId,
          sourceRuleId: literal(mref('parameters.sourceRuleId')),
        })),
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', mindex('track:declarations'), 'components', 'declarations', 'records'],
      value: concat(declarationRecords, list(record({
        subjectId: variable('actorId'),
        declarationType: literal(mref('parameters.declarationType')),
        audience: literal('all'),
        state: literal('published'),
        correlationId,
        sourceRuleId: literal(mref('parameters.sourceRuleId')),
      }))),
    },
    {
      kind: 'set',
      path: ['world', 'entities', mindex('track:score-contributions'), 'components', 'scoreContributions', 'records'],
      value: concat(
        path(entities, mindex('track:score-contributions'), 'components', 'scoreContributions', 'records'),
        list(record({
          subjectId: variable('actorId'),
          dimension: literal('han'),
          operation: literal('add'),
          amount: literal(mref('parameters.riichiHan')),
          stage: literal('base-yaku'),
          lifetime: literal('until-hand-end'),
          correlationId,
          sourceRuleId: literal(mref('parameters.sourceRuleId')),
        })),
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', mindex('track:discard-policies'), 'components', 'discardPolicies', 'records'],
      value: concat(discardPolicyRecords, { kind: 'list', items: policyItems }),
    },
    {
      kind: 'set',
      path: ['world', 'entities', mindex('track:furiten-policies'), 'components', 'furitenPolicies', 'records'],
      value: concat(
        path(entities, mindex('track:furiten-policies'), 'components', 'furitenPolicies', 'records'),
        list(record({
          subjectId: variable('actorId'),
          policyType: literal('missed-win-lock'),
          triggerEventType: literal('win-claim.passed'),
          resultingState: literal('furiten'),
          furitenClass: literal('riichi-pass'),
          lifetime: literal('until-hand-end'),
          correlationId,
          sourceRuleId: literal(mref('parameters.sourceRuleId')),
        })),
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', mindex('track:visibility'), 'components', 'visibility', 'records'],
      value: concat(
        visibilityRecords,
        map(chosenIds, 'tileId', record({
          entityId: variable('tileId'),
          audience: literal('all'),
          visibility: literal('face-up'),
          ownershipPreserved: literal(true),
          reason: literal(mref('parameters.visibilityReason')),
          correlationId,
          sourceRuleId: literal(mref('parameters.sourceRuleId')),
        })),
      ),
    },
  ],
};

export const TURBO_DECLARATION_MODULE = {
  id: 'rule.turbo-riichi.declaration',
  version: '1.0.0',
  title: 'ターボ立直 declaration facts',
  description: 'Discloses an exact concealed suited-seven triplet and commits independent resource, declaration, scoring, discard, missed-opportunity and visibility facts.',
  parameters: {
    schema: {
      type: 'object',
      properties: {
        sourceRuleId: { type: 'string', minLength: 1 },
        declarerId: { type: 'string', minLength: 1 },
        stake: { type: 'number', integer: true, minimum: 1 },
        riichiHan: { type: 'number', integer: true, minimum: 0 },
        potAccountId: { type: 'string', minLength: 1 },
        declarationType: { type: 'string', minLength: 1 },
        visibilityReason: { type: 'string', minLength: 1 },
        allowedProofFaces: {
          type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, uniqueItems: true,
        },
      },
      required: [
        'sourceRuleId', 'declarerId', 'stake', 'riichiHan', 'potAccountId',
        'declarationType', 'visibilityReason', 'allowedProofFaces',
      ],
      additionalProperties: false,
    },
    defaults: {
      sourceRuleId: 'rule:turbo-riichi',
      declarerId: 'east',
      stake: 1000,
      riichiHan: 1,
      potAccountId: 'riichi-pot',
      declarationType: 'turbo-riichi',
      visibilityReason: 'turbo-riichi-proof',
      allowedProofFaces: ['m7', 'p7', 's7'],
    },
  },
  requiredBindings: ['ledgerId', 'playerIds', 'turnProcedureId', 'awaitDiscardNodeId'],
  additions: {
    entities: [
      { id: 'track:resource-transfers', kind: 'fact-track', components: { resourceTransfers: { records: [] } } },
      { id: 'track:declarations', kind: 'fact-track', components: { declarations: { records: [] } } },
      { id: 'track:score-contributions', kind: 'fact-track', components: { scoreContributions: { records: [] } } },
      { id: 'track:discard-policies', kind: 'fact-track', components: { discardPolicies: { records: [] } } },
      { id: 'track:furiten-policies', kind: 'fact-track', components: { furitenPolicies: { records: [] } } },
      { id: 'track:visibility', kind: 'fact-track', components: { visibility: { records: [] } } },
      {
        id: 'rule:turbo-riichi',
        kind: 'rule-instance',
        components: {
          rulePolicy: {
            sourceRuleId: mref('parameters.sourceRuleId'),
            declarerId: mref('parameters.declarerId'),
            stake: mref('parameters.stake'),
            riichiHan: mref('parameters.riichiHan'),
          },
        },
      },
    ],
    actions: [{
      id: 'declare-turbo-riichi',
      parameters: { tileIds: 'string[]' },
      requirements: [
        {
          id: 'turbo.declare-turn',
          kind: 'procedure-token',
          procedureId: mref('bindings.turnProcedureId'),
          nodeId: mref('bindings.awaitDiscardNodeId'),
          owner: 'actor',
          message: 'The declaration is unavailable from this procedure state.',
        },
        { id: 'turbo.triplet-present', kind: 'parameter-present', parameter: 'tileIds', message: 'Three physical tile ids are required.' },
        { id: 'turbo.triplet-length', kind: 'array-length', value: { kind: 'context', path: 'params.tileIds' }, length: 3, message: 'Exactly three tiles must be exposed.' },
        { id: 'turbo.triplet-distinct', kind: 'entities-distinct', entities: { kind: 'context', path: 'params.tileIds' }, message: 'The exposed tiles must be distinct.' },
        {
          id: 'turbo.triplet-in-hand',
          kind: 'entities-in-zone',
          entities: { kind: 'context', path: 'params.tileIds' },
          zone: { kind: 'template', template: 'hand:${actorId}' },
          message: 'The exposed tiles must remain in the declarer hand.',
        },
        { id: 'turbo.declaration-eligible', kind: 'core.constraint', programId: declarationConstraintId, message: 'The selected entities do not satisfy the declaration proof.' },
      ],
      effects: [
        { kind: 'core.rewrite', programId: declarationRewriteId },
        { kind: 'event.emit', eventType: 'resource.transferred', subjects: [{ kind: 'actor' }], payload: { asset: 'points', amount: mref('parameters.stake'), toAccountId: mref('parameters.potAccountId') } },
        { kind: 'event.emit', eventType: 'declaration.published', subjects: [{ kind: 'actor' }], payload: { declarationType: mref('parameters.declarationType'), audience: 'all' } },
        { kind: 'event.emit', eventType: 'score-contribution.granted', subjects: [{ kind: 'actor' }], payload: { dimension: 'han', amount: mref('parameters.riichiHan') } },
        {
          kind: 'event.emit',
          eventType: 'discard-policy.activated',
          subjects: mmap(mref('bindings.playerIds'), 'playerId', {
            kind: 'entity', entityKind: 'player', id: { kind: 'literal', value: mref('locals.playerId') },
          }),
          payload: { allowedSource: 'latest-draw', targetScope: 'all-players' },
        },
        { kind: 'event.emit', eventType: 'furiten-policy.activated', subjects: [{ kind: 'actor' }], payload: { furitenClass: 'riichi-pass' } },
        { kind: 'event.emit', eventType: 'visibility.updated', subjects: [{ kind: 'actor' }], payload: { audience: 'all', reason: mref('parameters.visibilityReason') } },
      ],
    }],
    corePrograms: {
      constraints: [declarationConstraint],
      reducers: [],
      rewrites: [declarationRewrite],
    },
    metadata: {
      declarationInputSchema: {
        type: 'object',
        properties: {
          tileIds: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3, uniqueItems: true },
        },
        required: ['tileIds'],
        additionalProperties: false,
      },
    },
  },
  artifacts: {
    actionId: 'declare-turbo-riichi',
    inputSchema: {
      type: 'object',
      properties: {
        tileIds: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3, uniqueItems: true },
      },
      required: ['tileIds'],
      additionalProperties: false,
    },
    trackIds: {
      transfers: 'track:resource-transfers',
      declarations: 'track:declarations',
      contributions: 'track:score-contributions',
      discardPolicies: 'track:discard-policies',
      furitenPolicies: 'track:furiten-policies',
      visibility: 'track:visibility',
    },
  },
} as unknown as RuleModuleDefinition;

const winRecords = path(entities, mindex('track:wins'), 'components', 'wins', 'records');
const responseBatchRecords = path(
  entities,
  mindex('track:response-batches'),
  'components',
  'responseBatches',
  'records',
);
const latestDraws = path(variable('reducers'), 'module.continuing-win.latest-draw', 'latestDraws');
const actorDraw = path(filter(
  latestDraws,
  'draw',
  compare('eq', path(variable('draw'), 'subjectId'), variable('actorId')),
), '0');
const actorWinCount = aggregate('count', filter(
  winRecords,
  'win',
  compare('eq', path(variable('win'), 'winnerId'), variable('actorId')),
));
const winLimitAllows = any(
  compare('eq', literal(mref('parameters.maxWinsPerPlayer')), literal(0)),
  compare('lt', actorWinCount, literal(mref('parameters.maxWinsPerPlayer'))),
);
const policyRecords = path(
  entities,
  mindex(mref('bindings.discardPolicyTrackId')),
  'components',
  'discardPolicies',
  'records',
);
const actorPolicies = filter(
  policyRecords,
  'policy',
  compare('eq', path(variable('policy'), 'subjectId'), variable('actorId')),
);
const actorLatestDraw = path(filter(
  latestDraws,
  'draw',
  compare('eq', path(variable('draw'), 'subjectId'), variable('actorId')),
), '0');
const expectedTurn = path(filter(
  literal(mref('bindings.turnPairs')),
  'pair',
  compare('eq', path(variable('pair'), 'actorId'), variable('actorId')),
), '0');
const discardConstraintId = 'module.continuing-win.discard-eligible';
const ronConstraintId = 'module.continuing-win.claim-eligible';
const selfConstraintId = 'module.continuing-win.direct-eligible';
const noOpenConstraintId = 'module.continuing-win.no-open-window';
const ronRewriteId = 'module.continuing-win.record-selected';
const selfRewriteId = 'module.continuing-win.record-direct';
const responseBatchRewriteId = 'module.continuing-win.collect-response-batch';

const discardConstraint = {
  id: discardConstraintId,
  variables: [],
  constraints: [all(
    compare('eq', path(params, 'nextActorId'), path(expectedTurn, 'nextActorId')),
    any(
      compare('eq', aggregate('count', actorPolicies), literal(0)),
      compare('eq', path(params, 'tileId'), path(actorLatestDraw, 'tileId')),
    ),
  )],
  maxSolutions: 1,
  maxSteps: 100_000,
};
const duplicateSelected = aggregate('count', filter(
  winRecords,
  'win',
  all(
    compare('eq', path(variable('win'), 'winnerId'), variable('actorId')),
    compare('eq', path(variable('win'), 'exposureId'), path(variable('window'), 'sourceEventId')),
  ),
));
const selectedConstraint = {
  id: ronConstraintId,
  variables: [],
  constraints: [all(compare('eq', duplicateSelected, literal(0)), winLimitAllows)],
  maxSolutions: 1,
  maxSteps: 100_000,
};
const evidenceRelations = filter(
  path(world, 'relations'),
  'relation',
  all(
    compare('eq', path(variable('relation'), 'type'), literal(mref('bindings.canWinRelationType'))),
    compare('eq', path(variable('relation'), 'source', 'kind'), literal('player')),
    compare('eq', path(variable('relation'), 'source', 'id'), variable('actorId')),
    compare('eq', path(variable('relation'), 'target', 'kind'), literal('tile')),
    compare('eq', path(variable('relation'), 'target', 'id'), path(actorDraw, 'tileId')),
  ),
);
const duplicateDirect = aggregate('count', filter(
  winRecords,
  'win',
  all(
    compare('eq', path(variable('win'), 'winnerId'), variable('actorId')),
    compare('eq', path(variable('win'), 'exposureId'), path(actorDraw, 'exposureId')),
  ),
));
const directConstraint = {
  id: selfConstraintId,
  variables: [],
  constraints: [all(
    compare('eq', aggregate('count', evidenceRelations), literal(1)),
    compare('eq', duplicateDirect, literal(0)),
    winLimitAllows,
  )],
  maxSolutions: 1,
  maxSteps: 100_000,
};
const openWindows = filter(
  entities,
  'entity',
  all(
    compare('eq', path(variable('entity'), 'kind'), literal('response-window')),
    compare('eq', path(variable('entity'), 'components', 'responseWindow', 'state'), literal('open')),
  ),
);
const noOpenWindowConstraint = {
  id: noOpenConstraintId,
  variables: [],
  constraints: [compare('eq', aggregate('count', openWindows), literal(0))],
  maxSolutions: 1,
  maxSteps: 100_000,
};
const selectedRewrite = {
  id: ronRewriteId,
  operations: [{
    kind: 'set',
    path: ['world', 'entities', mindex('track:wins'), 'components', 'wins', 'records'],
    value: concat(winRecords, list(record({
      winnerId: variable('actorId'),
      tileId: path(variable('window'), 'sourceEntityId'),
      exposureId: path(variable('window'), 'sourceEventId'),
      sourceActorId: path(variable('window'), 'sourceActorId'),
      mode: literal('ron'),
      correlationId: variable('actionEntityId'),
      sourceRuleId: literal(mref('parameters.sourceRuleId')),
    }))),
  }],
};
const directRewrite = {
  id: selfRewriteId,
  operations: [{
    kind: 'set',
    path: ['world', 'entities', mindex('track:wins'), 'components', 'wins', 'records'],
    value: concat(winRecords, list(record({
      winnerId: variable('actorId'),
      tileId: path(actorDraw, 'tileId'),
      exposureId: path(actorDraw, 'exposureId'),
      sourceActorId: variable('actorId'),
      mode: literal('tsumo'),
      correlationId: variable('actionEntityId'),
      sourceRuleId: literal(mref('parameters.sourceRuleId')),
    }))),
  }],
};
const selectedItems = map(
  path(variable('window'), 'selected'),
  'selected',
  record({
    actorId: path(variable('selected'), 'actorId'),
    actionId: path(variable('selected'), 'actionId'),
    actionEntityId: path(variable('selected'), 'actionEntityId'),
  }),
);
const batchId = path(variable('window'), 'id');
const matchingBatches = filter(
  responseBatchRecords,
  'batch',
  compare('eq', path(variable('batch'), 'id'), batchId),
);
const existingBatch = path(matchingBatches, '0');
const nextProcessed = distinct(concat(
  path(existingBatch, 'processedKeys'),
  list(path(variable('submission'), 'actionEntityId')),
));
const initialProcessed = list(path(variable('submission'), 'actionEntityId'));
const createdBatch = record({
  id: batchId,
  kind: literal('continuing-win'),
  sourceWindowId: batchId,
  items: selectedItems,
  processedKeys: initialProcessed,
  state: choose(
    compare('gte', aggregate('count', initialProcessed), aggregate('count', selectedItems)),
    literal('ready'),
    literal('collecting'),
  ),
  metadata: record({
    sourceActorId: path(variable('window'), 'sourceActorId'),
    sourceEventId: path(variable('window'), 'sourceEventId'),
    sourceEntityId: path(variable('window'), 'sourceEntityId'),
    parentTokenId: path(variable('window'), 'parentTokenId'),
    continuingHand: literal(true),
  }),
});
const updatedExistingBatch = record({
  id: path(existingBatch, 'id'),
  kind: path(existingBatch, 'kind'),
  sourceWindowId: path(existingBatch, 'sourceWindowId'),
  items: path(existingBatch, 'items'),
  processedKeys: nextProcessed,
  state: choose(
    compare('gte', aggregate('count', nextProcessed), aggregate('count', path(existingBatch, 'items'))),
    literal('ready'),
    literal('collecting'),
  ),
  metadata: path(existingBatch, 'metadata'),
});
const responseBatchRewrite = {
  id: responseBatchRewriteId,
  operations: [{
    kind: 'set',
    path: ['world', 'entities', mindex('track:response-batches'), 'components', 'responseBatches', 'records'],
    value: choose(
      compare('eq', aggregate('count', matchingBatches), literal(0)),
      concat(responseBatchRecords, list(createdBatch)),
      map(
        responseBatchRecords,
        'batch',
        choose(
          compare('eq', path(variable('batch'), 'id'), batchId),
          updatedExistingBatch,
          variable('batch'),
        ),
      ),
    ),
  }],
};
const latestDrawReducer = {
  id: 'module.continuing-win.latest-draw',
  initialState: { latestDraws: mref('bindings.initialDraws') },
  transitions: [{
    when: all(
      compare('eq', path(variable('event'), 'type'), literal('entity.moved')),
      compare('eq', path(variable('event'), 'payload', 'fromZone'), literal(mref('bindings.liveZoneId'))),
    ),
    updates: [{
      path: ['latestDraws'],
      value: map(path(variable('state'), 'latestDraws'), 'draw', choose(
        compare('eq', path(variable('draw'), 'subjectId'), path(variable('event'), 'actorId')),
        record({
          subjectId: path(variable('draw'), 'subjectId'),
          tileId: path(variable('event'), 'subjects', '0', 'id'),
          exposureId: path(variable('event'), 'id'),
        }),
        variable('draw'),
      )),
    }],
  }],
};

export const CONTINUING_WIN_FLOW_MODULE = {
  id: 'flow.continuing-multi-win',
  version: '1.0.0',
  title: 'Continuing multi-win flow',
  description: 'Consumes subject-scoped latest-draw policies, opens all-selection response windows, records repeated selected/direct outcomes, and gates continuation until every response is resolved.',
  parameters: {
    schema: {
      type: 'object',
      properties: {
        sourceRuleId: { type: 'string', minLength: 1 },
        maxWinsPerPlayer: { type: 'number', integer: true, minimum: 0 },
        maxSelections: { type: 'number', integer: true, minimum: 1 },
      },
      required: ['sourceRuleId', 'maxWinsPerPlayer', 'maxSelections'],
      additionalProperties: false,
    },
    defaults: { sourceRuleId: 'rule:turbo-riichi', maxWinsPerPlayer: 0, maxSelections: 3 },
  },
  requiredBindings: [
    'playerIds', 'turnPairs', 'initialDraws', 'liveZoneId', 'canWinRelationType',
    'turnProcedureId', 'awaitDrawNodeId', 'awaitDiscardNodeId',
    'drawActionId', 'discardActionId', 'endActionId', 'discardPolicyTrackId',
  ],
  additions: {
    entities: [
      { id: 'track:wins', kind: 'fact-track', components: { wins: { records: [] } } },
      { id: 'track:response-batches', kind: 'fact-track', components: { responseBatches: { records: [] } } },
    ],
    actions: [
      {
        id: 'turbo-riichi.win',
        parameters: { windowId: 'string' },
        requirements: [
          { id: 'continuing.win-window', kind: 'response-window-open', windowId: { kind: 'context', path: 'params.windowId' }, message: 'The outcome opportunity is not open.' },
          {
            id: 'continuing.can-win',
            kind: 'relation-exists',
            source: { kind: 'actor' },
            target: { kind: 'window-source-entity', entityKind: 'tile' },
            relationType: mref('bindings.canWinRelationType'),
            message: 'This subject does not have matching evidence for the exposed entity.',
          },
          { id: 'continuing.win-limit', kind: 'core.constraint', programId: ronConstraintId, message: 'This subject has reached the configured outcome limit.' },
        ],
        effects: [{ kind: 'response-window.submit', windowId: { kind: 'context', path: 'params.windowId' } }],
      },
      {
        id: 'response.pass',
        parameters: { windowId: 'string' },
        requirements: [{
          id: 'continuing.pass-window',
          kind: 'response-window-open',
          windowId: { kind: 'context', path: 'params.windowId' },
          message: 'The outcome opportunity is not open.',
        }],
        effects: [{ kind: 'response-window.submit', windowId: { kind: 'context', path: 'params.windowId' } }],
      },
      {
        id: 'turbo-riichi.self-win',
        parameters: {},
        requirements: [
          {
            id: 'continuing.direct-turn',
            kind: 'procedure-token',
            procedureId: mref('bindings.turnProcedureId'),
            nodeId: mref('bindings.awaitDiscardNodeId'),
            owner: 'actor',
            message: 'A direct outcome is unavailable from this procedure state.',
          },
          { id: 'continuing.direct-eligible', kind: 'core.constraint', programId: selfConstraintId, message: 'The latest draw is not an available continuing outcome.' },
        ],
        effects: [
          { kind: 'core.rewrite', programId: selfRewriteId },
          { kind: 'event.emit', eventType: 'win.recorded', subjects: [{ kind: 'actor' }], payload: { mode: 'tsumo', continuingHand: true } },
        ],
      },
    ],
    responseWindows: [{
      id: 'turbo-riichi.win-opportunity',
      allowedActionIds: ['turbo-riichi.win', 'response.pass'],
      participantOrder: mref('bindings.playerIds'),
      excludeSourceActor: true,
      tiers: [{
        actionIds: ['turbo-riichi.win'],
        selection: 'all',
        maxSelections: mref('parameters.maxSelections'),
      }],
      noSelectionEffects: [],
      selectionEffects: {
        'turbo-riichi.win': [
          { kind: 'core.rewrite', programId: responseBatchRewriteId },
          { kind: 'core.rewrite', programId: ronRewriteId },
          {
            kind: 'event.emit',
            eventType: 'win.recorded',
            subjects: [{ kind: 'actor' }],
            objects: [{ kind: 'window-source-entity', entityKind: 'tile' }],
            payload: { mode: 'ron', continuingHand: true },
          },
        ],
      },
    }],
    corePrograms: {
      constraints: [discardConstraint, selectedConstraint, directConstraint, noOpenWindowConstraint],
      reducers: [latestDrawReducer],
      rewrites: [selectedRewrite, directRewrite, responseBatchRewrite],
    },
  },
  patches: [
    {
      kind: 'action.requirements',
      actionId: mref('bindings.discardActionId'),
      placement: 'append',
      values: [{ id: 'discard.continuing-policy', kind: 'core.constraint', programId: discardConstraintId, message: 'An active policy requires the latest drawn entity and the declared next actor.' }],
    },
    {
      kind: 'action.effects',
      actionId: mref('bindings.discardActionId'),
      placement: 'append',
      values: [{
        kind: 'response-window.open',
        definitionId: 'turbo-riichi.win-opportunity',
        windowId: { kind: 'template', template: 'turbo-response:${lastEventId}' },
        sourceActor: { kind: 'context', path: 'actorId' },
        sourceEvent: { kind: 'context', path: 'lastEventId' },
        sourceEntity: { kind: 'context', path: 'params.tileId' },
        parentTokenId: { kind: 'context', path: 'token.id' },
      }],
    },
    {
      kind: 'action.requirements',
      actionId: mref('bindings.drawActionId'),
      placement: 'append',
      values: [{ id: 'draw.responses-complete', kind: 'core.constraint', programId: noOpenConstraintId, message: 'A response window is still open.' }],
    },
    {
      kind: 'action.requirements',
      actionId: mref('bindings.endActionId'),
      placement: 'append',
      values: [{ id: 'end.responses-complete', kind: 'core.constraint', programId: noOpenConstraintId, message: 'A response window is still open.' }],
    },
  ],
  artifacts: {
    actionIds: {
      selected: 'turbo-riichi.win',
      pass: 'response.pass',
      direct: 'turbo-riichi.self-win',
    },
    windowId: 'turbo-riichi.win-opportunity',
    reducerId: 'module.continuing-win.latest-draw',
    trackIds: { wins: 'track:wins', responseBatches: 'track:response-batches' },
    responseBatchProgramId: responseBatchRewriteId,
  },
} as unknown as RuleModuleDefinition;

export const TURBO_RIICHI_MODULES: RuleModuleDefinition[] = [
  TURBO_DECLARATION_MODULE,
  CONTINUING_WIN_FLOW_MODULE,
];
