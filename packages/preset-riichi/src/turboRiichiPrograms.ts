import type {
  CoreFormula,
  EventReducerDefinition,
  FiniteDomainProgram,
  RewriteOperation,
  RewriteProgram,
} from '@mahjongplus/world-calculus';
import {
  aggregate,
  all,
  any,
  arithmetic,
  choose,
  compare,
  concat,
  contains,
  externalConstraint,
  filter,
  firstMatching,
  list,
  literal,
  map,
  path,
  quantify,
  record,
  variable,
} from './fixtureDsl.js';
import type { TurboRiichiModel } from './turboRiichiModel.js';
import { TURBO_NEXT, TURBO_PLAYERS } from './turboRiichiTypes.js';

export interface TurboRiichiPrograms {
  constraints: {
    declaration: FiniteDomainProgram;
    discard: FiniteDomainProgram;
    ronLimit: FiniteDomainProgram;
    selfWin: FiniteDomainProgram;
    wallEmpty: FiniteDomainProgram;
  };
  rewrites: {
    declaration: RewriteProgram;
    ron: RewriteProgram;
    selfWin: RewriteProgram;
  };
  reducers: {
    latestDraw: EventReducerDefinition;
  };
}

export function createTurboRiichiPrograms(model: TurboRiichiModel): TurboRiichiPrograms {
  const { policy, entityIndex, ids } = model;
  const world = variable('world');
  const worldEntities = path(world, 'entities');
  const worldZones = path(world, 'zones');
  const worldRelations = path(world, 'relations');
  const params = variable('params');
  const chosenIds = path(params, 'tileIds');
  const chosenEntities = filter(worldEntities, 'entity', contains(chosenIds, path(variable('entity'), 'id')));
  const chosenFace = path(chosenEntities, '0', 'components', 'tile', 'baseFace');
  const actorEntity = firstMatching(
    worldEntities,
    'entity',
    compare('eq', path(variable('entity'), 'id'), variable('actorId')),
  );
  const visibilityRecords = path(
    worldEntities,
    entityIndex('track:visibility'),
    'components',
    'visibility',
    'records',
  );
  const priorChosenVisibility = filter(
    visibilityRecords,
    'visibility',
    contains(chosenIds, path(variable('visibility'), 'entityId')),
  );
  const declarationRecords = path(
    worldEntities,
    entityIndex('track:declarations'),
    'components',
    'declarations',
    'records',
  );
  const accounts = path(worldEntities, entityIndex('ledger:points'), 'components', 'ledger', 'accounts');
  const actorAccount = firstMatching(
    accounts,
    'account',
    compare('eq', path(variable('account'), 'id'), variable('actorId')),
  );
  const declaration = externalConstraint('turbo-riichi.declaration-eligible', all(
    compare('eq', variable('actorId'), literal(policy.declarerId)),
    compare('eq', path(actorEntity, 'components', 'handState', 'closed'), literal(true)),
    compare('eq', aggregate('count', chosenIds), literal(3)),
    compare('eq', aggregate('count', { kind: 'distinct', source: chosenIds }), literal(3)),
    compare('eq', aggregate('count', chosenEntities), literal(3)),
    contains(literal(['m7', 'p7', 's7']), chosenFace),
    quantify('forall', chosenEntities, 'tile', compare(
      'eq',
      path(variable('tile'), 'components', 'tile', 'baseFace'),
      chosenFace,
    )),
    compare('eq', aggregate('count', priorChosenVisibility), literal(0)),
    compare('eq', aggregate('count', declarationRecords), literal(0)),
    compare('gte', path(actorAccount, 'balance'), literal(policy.stake)),
  ));

  const policyRecords = path(
    worldEntities,
    entityIndex('track:discard-policies'),
    'components',
    'discardPolicies',
    'records',
  );
  const actorPolicies = filter(
    policyRecords,
    'policy',
    compare('eq', path(variable('policy'), 'subjectId'), variable('actorId')),
  );
  const latestDraws = path(variable('reducers'), 'turbo-riichi.latest-draw', 'latestDraws');
  const actorLatestDraw = firstMatching(
    latestDraws,
    'draw',
    compare('eq', path(variable('draw'), 'subjectId'), variable('actorId')),
  );
  const turnPairs = TURBO_PLAYERS.map((seat) => ({ actorId: seat, nextActorId: TURBO_NEXT[seat] }));
  const expectedTurn = firstMatching(
    literal(turnPairs),
    'pair',
    compare('eq', path(variable('pair'), 'actorId'), variable('actorId')),
  );
  const discard = externalConstraint('turbo-riichi.discard-eligible', all(
    compare('eq', path(params, 'nextActorId'), path(expectedTurn, 'nextActorId')),
    any(
      compare('eq', aggregate('count', actorPolicies), literal(0)),
      compare('eq', path(params, 'tileId'), path(actorLatestDraw, 'tileId')),
    ),
  ));

  const winRecords = path(worldEntities, entityIndex('track:wins'), 'components', 'wins', 'records');
  const actorWinCount = aggregate('count', filter(
    winRecords,
    'win',
    compare('eq', path(variable('win'), 'winnerId'), variable('actorId')),
  ));
  const winLimitAllows: CoreFormula = policy.maxWinsPerPlayer == null
    ? { kind: 'boolean', value: true }
    : compare('lt', actorWinCount, literal(policy.maxWinsPerPlayer));
  const duplicateRon = aggregate('count', filter(
    winRecords,
    'win',
    all(
      compare('eq', path(variable('win'), 'winnerId'), variable('actorId')),
      compare('eq', path(variable('win'), 'exposureId'), path(variable('window'), 'sourceEventId')),
    ),
  ));
  const ronLimit = externalConstraint('turbo-riichi.ron-limit', all(
    compare('eq', duplicateRon, literal(0)),
    winLimitAllows,
  ));

  const actorDraw = firstMatching(
    latestDraws,
    'draw',
    compare('eq', path(variable('draw'), 'subjectId'), variable('actorId')),
  );
  const selfWinRelations = filter(
    worldRelations,
    'relation',
    all(
      compare('eq', path(variable('relation'), 'type'), literal('can-win-on')),
      compare('eq', path(variable('relation'), 'source', 'kind'), literal('player')),
      compare('eq', path(variable('relation'), 'source', 'id'), variable('actorId')),
      compare('eq', path(variable('relation'), 'target', 'kind'), literal('tile')),
      compare('eq', path(variable('relation'), 'target', 'id'), path(actorDraw, 'tileId')),
    ),
  );
  const duplicateSelf = aggregate('count', filter(
    winRecords,
    'win',
    all(
      compare('eq', path(variable('win'), 'winnerId'), variable('actorId')),
      compare('eq', path(variable('win'), 'exposureId'), path(actorDraw, 'exposureId')),
    ),
  ));
  const selfWin = externalConstraint('turbo-riichi.self-win-eligible', all(
    compare('eq', aggregate('count', selfWinRelations), literal(1)),
    compare('eq', duplicateSelf, literal(0)),
    winLimitAllows,
  ));
  const wallEmpty = externalConstraint('turbo-riichi.wall-empty', compare(
    'eq',
    aggregate('count', path(worldZones, '0', 'entries')),
    literal(0),
  ));

  const correlationId = variable('actionEntityId');
  const updatedAccounts = map(accounts, 'account', choose(
    compare('eq', path(variable('account'), 'id'), variable('actorId')),
    record({
      id: path(variable('account'), 'id'),
      balance: arithmetic('subtract', path(variable('account'), 'balance'), literal(policy.stake)),
    }),
    choose(
      compare('eq', path(variable('account'), 'id'), literal('riichi-pot')),
      record({
        id: path(variable('account'), 'id'),
        balance: arithmetic('add', path(variable('account'), 'balance'), literal(policy.stake)),
      }),
      variable('account'),
    ),
  ));
  const declarationOperations: RewriteOperation[] = [
    {
      kind: 'set',
      path: ['world', 'entities', entityIndex('ledger:points'), 'components', 'ledger', 'accounts'],
      value: updatedAccounts,
    },
    {
      kind: 'set',
      path: ['world', 'entities', entityIndex('track:resource-transfers'), 'components', 'resourceTransfers', 'records'],
      value: concat(
        path(worldEntities, entityIndex('track:resource-transfers'), 'components', 'resourceTransfers', 'records'),
        list(record({
          asset: literal('points'),
          fromAccountId: variable('actorId'),
          toAccountId: literal('riichi-pot'),
          amount: literal(policy.stake),
          correlationId,
          sourceRuleId: literal(policy.id),
        })),
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', entityIndex('track:declarations'), 'components', 'declarations', 'records'],
      value: concat(declarationRecords, list(record({
        subjectId: variable('actorId'),
        declarationType: literal('turbo-riichi'),
        audience: literal('all'),
        state: literal('published'),
        correlationId,
        sourceRuleId: literal(policy.id),
      }))),
    },
    {
      kind: 'set',
      path: ['world', 'entities', entityIndex('track:score-contributions'), 'components', 'scoreContributions', 'records'],
      value: concat(
        path(worldEntities, entityIndex('track:score-contributions'), 'components', 'scoreContributions', 'records'),
        list(record({
          subjectId: variable('actorId'),
          dimension: literal('han'),
          operation: literal('add'),
          amount: literal(policy.riichiHan),
          stage: literal('base-yaku'),
          lifetime: literal('until-hand-end'),
          correlationId,
          sourceRuleId: literal(policy.id),
        })),
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', entityIndex('track:discard-policies'), 'components', 'discardPolicies', 'records'],
      value: concat(policyRecords, {
        kind: 'list',
        items: TURBO_PLAYERS.map((seat) => record({
          subjectId: literal(seat),
          policyType: literal('discard-selection'),
          allowedSource: literal('latest-draw'),
          consequence: literal('reject'),
          lifetime: literal('until-hand-end'),
          source: literal(seat === policy.declarerId ? 'riichi' : 'turbo-riichi'),
          correlationId,
          sourceRuleId: literal(policy.id),
        })),
      }),
    },
    {
      kind: 'set',
      path: ['world', 'entities', entityIndex('track:furiten-policies'), 'components', 'furitenPolicies', 'records'],
      value: concat(
        path(worldEntities, entityIndex('track:furiten-policies'), 'components', 'furitenPolicies', 'records'),
        list(record({
          subjectId: variable('actorId'),
          policyType: literal('missed-win-lock'),
          triggerEventType: literal('win-claim.passed'),
          resultingState: literal('furiten'),
          furitenClass: literal('riichi-pass'),
          lifetime: literal('until-hand-end'),
          correlationId,
          sourceRuleId: literal(policy.id),
        })),
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', entityIndex('track:visibility'), 'components', 'visibility', 'records'],
      value: concat(
        visibilityRecords,
        map(chosenIds, 'tileId', record({
          entityId: variable('tileId'),
          audience: literal('all'),
          visibility: literal('face-up'),
          ownershipPreserved: literal(true),
          reason: literal('turbo-riichi-proof'),
          correlationId,
          sourceRuleId: literal(policy.id),
        })),
      ),
    },
  ];
  const declarationRewrite: RewriteProgram = {
    id: 'turbo-riichi.commit-declaration',
    operations: declarationOperations,
  };
  const ron: RewriteProgram = {
    id: 'turbo-riichi.record-ron',
    operations: [{
      kind: 'set',
      path: ['world', 'entities', entityIndex('track:wins'), 'components', 'wins', 'records'],
      value: concat(winRecords, list(record({
        winnerId: variable('actorId'),
        tileId: path(variable('window'), 'sourceEntityId'),
        exposureId: path(variable('window'), 'sourceEventId'),
        sourceActorId: path(variable('window'), 'sourceActorId'),
        mode: literal('ron'),
        correlationId: variable('actionEntityId'),
        sourceRuleId: literal(policy.id),
      }))),
    }],
  };
  const selfWinRewrite: RewriteProgram = {
    id: 'turbo-riichi.record-tsumo',
    operations: [{
      kind: 'set',
      path: ['world', 'entities', entityIndex('track:wins'), 'components', 'wins', 'records'],
      value: concat(winRecords, list(record({
        winnerId: variable('actorId'),
        tileId: path(actorDraw, 'tileId'),
        exposureId: path(actorDraw, 'exposureId'),
        sourceActorId: variable('actorId'),
        mode: literal('tsumo'),
        correlationId: variable('actionEntityId'),
        sourceRuleId: literal(policy.id),
      }))),
    }],
  };
  const latestDraw: EventReducerDefinition = {
    id: 'turbo-riichi.latest-draw',
    initialState: {
      latestDraws: TURBO_PLAYERS.map((subjectId) => ({
        subjectId,
        tileId: subjectId === policy.declarerId ? ids.initialDrawId : null,
        exposureId: subjectId === policy.declarerId ? `initial-exposure:${policy.declarerId}` : null,
      })),
    },
    transitions: [{
      when: all(
        compare('eq', path(variable('event'), 'type'), literal('entity.moved')),
        compare('eq', path(variable('event'), 'payload', 'fromZone'), literal('wall.live')),
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

  return {
    constraints: { declaration, discard, ronLimit, selfWin, wallEmpty },
    rewrites: { declaration: declarationRewrite, ron, selfWin: selfWinRewrite },
    reducers: { latestDraw },
  };
}
