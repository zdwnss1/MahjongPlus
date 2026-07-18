import type { DataSchema, WorldSource } from '@mahjongplus/world-language';
import { assertDataSchema } from '@mahjongplus/world-language';
import type {
  CoreExpression,
  CoreFormula,
  FiniteDomainProgram,
  RewriteOperation,
  RewriteProgram,
} from '@mahjongplus/world-calculus';
import type { EntityRecord, ZoneRecord } from '@mahjongplus/world-model';

export type SuperRiichiScope = 'global' | 'owner-only';
export type SuperRiichiIndicatorPolicy = 'standard-cap' | 'unbounded-extend';

export interface SuperRiichiRuleOptions {
  id?: string;
  ownerId?: string;
  scope?: SuperRiichiScope;
  indicatorPolicy?: SuperRiichiIndicatorPolicy;
  standardStake?: number;
  superStake?: number;
  extraIndicatorsPerUse?: number;
  standardExtraIndicatorCap?: number;
  extensionTilesPerUse?: number;
  startingPoints?: number;
  liveWallTileCount?: number;
  deadWallTileCount?: number;
}

export interface ActionChoiceContract {
  id: string;
  label: string;
  summary: string;
  preview: Record<string, unknown>;
}

export interface ActionOfferContract {
  actionId: string;
  inputSchema: DataSchema;
  choices: ActionChoiceContract[];
}

export interface SuperRiichiRuleFixture {
  source: WorldSource;
  offer: ActionOfferContract;
  policy: Required<Omit<SuperRiichiRuleOptions, 'id'>> & { id: string };
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
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const aggregate = (operator: 'count' | 'sum' | 'min' | 'max', source: CoreExpression): CoreExpression => ({ kind: 'aggregate', operator, source });
const arithmetic = (
  operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo',
  left: CoreExpression,
  right: CoreExpression,
): CoreExpression => ({ kind: 'arithmetic', operator, left, right });
const choose = (condition: CoreFormula, thenValue: CoreExpression, elseValue: CoreExpression): CoreExpression => ({
  kind: 'if', condition, then: thenValue, else: elseValue,
});
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
const concat = (...sources: CoreExpression[]): CoreExpression => ({ kind: 'concat', sources });

const PLAYERS = ['east', 'south', 'west', 'north'] as const;

function zone(id: string, kind: string, entityIds: string[]): ZoneRecord {
  return {
    id,
    kind,
    ordered: true,
    entries: entityIds.map((entityId, ordinal) => ({
      slotId: `physical-wall-slot:${entityId}`,
      entityId,
      ordinal,
      metadata: {},
      state: 'occupied',
    })),
    metadata: {},
  };
}

function normalizeOptions(options: SuperRiichiRuleOptions): SuperRiichiRuleFixture['policy'] {
  const policy = {
    id: options.id ?? 'rule:super-riichi',
    ownerId: options.ownerId ?? 'east',
    scope: options.scope ?? 'global',
    indicatorPolicy: options.indicatorPolicy ?? 'standard-cap',
    standardStake: options.standardStake ?? 1000,
    superStake: options.superStake ?? 5000,
    extraIndicatorsPerUse: options.extraIndicatorsPerUse ?? 2,
    standardExtraIndicatorCap: options.standardExtraIndicatorCap ?? 4,
    extensionTilesPerUse: options.extensionTilesPerUse ?? 4,
    startingPoints: options.startingPoints ?? 25000,
    liveWallTileCount: options.liveWallTileCount ?? 24,
    deadWallTileCount: options.deadWallTileCount ?? 14,
  } as const;
  if (!PLAYERS.includes(policy.ownerId as (typeof PLAYERS)[number])) throw new Error('Super-riichi owner must be a seat id.');
  for (const [name, value] of Object.entries(policy)) {
    if (typeof value === 'number' && (!Number.isInteger(value) || value < 0)) throw new Error(`${name} must be a non-negative integer.`);
  }
  if (policy.extraIndicatorsPerUse < 1) throw new Error('extraIndicatorsPerUse must be positive.');
  if (policy.superStake <= policy.standardStake) throw new Error('superStake must exceed the standard stake.');
  if (policy.indicatorPolicy === 'unbounded-extend') {
    if (policy.extensionTilesPerUse < policy.extraIndicatorsPerUse) throw new Error('Wall extension must cover all revealed indicators.');
    if (policy.extensionTilesPerUse % policy.extraIndicatorsPerUse !== 0) {
      throw new Error('Wall extension must contain an integral physical span per indicator.');
    }
  }
  return policy;
}

function firstMatching(source: CoreExpression, as: string, where: CoreFormula): CoreExpression {
  return path(filter(source, as, where), '0');
}

export function createSuperRiichiRuleFixture(options: SuperRiichiRuleOptions = {}): SuperRiichiRuleFixture {
  const policy = normalizeOptions(options);
  const mode = path(variable('params'), 'mode');
  const isSuper = compare('eq', mode, literal('super'));
  const world = variable('world');
  const entities = path(world, 'entities');
  const zones = path(world, 'zones');

  const players: EntityRecord[] = PLAYERS.map((seat) => ({
    id: seat,
    kind: 'player',
    components: { riichi: { eligible: true } },
  }));
  const liveTileIds = Array.from({ length: policy.liveWallTileCount }, (_, index) => `tile:live:${index}`);
  const deadTileIds = Array.from({ length: policy.deadWallTileCount }, (_, index) => `tile:dead:${index}`);
  const tiles: EntityRecord[] = [...liveTileIds, ...deadTileIds].map((id) => ({
    id,
    kind: 'tile',
    components: { tile: { baseFace: 'x', traits: [] } },
  }));
  const cappedCandidates = deadTileIds
    .filter((_id, index) => index % 2 === 0)
    .slice(0, policy.standardExtraIndicatorCap)
    .map((tileId, ordinal) => ({ tileId, ordinal }));
  if (policy.indicatorPolicy === 'standard-cap' && cappedCandidates.length < policy.standardExtraIndicatorCap) {
    throw new Error('The dead wall does not contain enough indicator candidates for the configured cap.');
  }

  const ledger: EntityRecord = {
    id: 'ledger:points',
    kind: 'resource-ledger',
    components: {
      ledger: {
        asset: 'points',
        accounts: [
          ...PLAYERS.map((id) => ({ id, balance: policy.startingPoints })),
          { id: 'riichi-pot', balance: 0 },
        ],
      },
    },
  };
  const track: EntityRecord = {
    id: 'track:dora-indicators',
    kind: 'reveal-track',
    components: {
      revealTrack: {
        channelId: 'dora',
        public: true,
        revealedCount: 0,
        capacity: policy.indicatorPolicy === 'standard-cap' ? policy.standardExtraIndicatorCap : 0,
        revealed: [],
        candidates: cappedCandidates,
        declaredActors: [],
      },
    },
  };
  const rule: EntityRecord = {
    id: policy.id,
    kind: 'rule-instance',
    components: { rulePolicy: structuredClone(policy) },
  };
  const initialEntities = [...players, ledger, track, rule, ...tiles];
  const ledgerIndex = players.length;
  const trackIndex = ledgerIndex + 1;

  const player = firstMatching(entities, 'entity', compare('eq', path(variable('entity'), 'id'), variable('actorId')));
  const accounts = path(entities, String(ledgerIndex), 'components', 'ledger', 'accounts');
  const actorAccount = firstMatching(accounts, 'account', compare('eq', path(variable('account'), 'id'), variable('actorId')));
  const actorBalance = path(actorAccount, 'balance');
  const trackValue = path(entities, String(trackIndex), 'components', 'revealTrack');
  const revealedCount = path(trackValue, 'revealedCount');
  const declaredActors = path(trackValue, 'declaredActors');
  const liveEntries = path(zones, '0', 'entries');
  const deadEntries = path(zones, '1', 'entries');
  const pointCost = choose(isSuper, literal(policy.superStake), literal(policy.standardStake));
  const scopeAllowsSuper = policy.scope === 'global'
    ? ({ kind: 'boolean', value: true } as CoreFormula)
    : compare('eq', variable('actorId'), literal(policy.ownerId));
  const capAllowsSuper = policy.indicatorPolicy === 'standard-cap'
    ? compare(
        'lte',
        arithmetic('add', revealedCount, literal(policy.extraIndicatorsPerUse)),
        literal(policy.standardExtraIndicatorCap),
      )
    : compare('gte', aggregate('count', liveEntries), literal(policy.extensionTilesPerUse));

  const eligibility: FiniteDomainProgram = {
    id: 'super-riichi.action-eligible',
    variables: [],
    constraints: [all(
      contains(literal(['standard', 'super']), mode),
      compare('eq', path(player, 'components', 'riichi', 'eligible'), literal(true)),
      not(contains(declaredActors, variable('actorId'))),
      compare('gte', actorBalance, pointCost),
      any(
        compare('eq', mode, literal('standard')),
        all(isSuper, scopeAllowsSuper, capAllowsSuper),
      ),
    )],
    maxSolutions: 1,
    maxSteps: 10000,
  };

  const updatedAccounts = map(accounts, 'account', choose(
    compare('eq', path(variable('account'), 'id'), variable('actorId')),
    record({
      id: path(variable('account'), 'id'),
      balance: arithmetic('subtract', path(variable('account'), 'balance'), pointCost),
    }),
    choose(
      compare('eq', path(variable('account'), 'id'), literal('riichi-pot')),
      record({
        id: path(variable('account'), 'id'),
        balance: arithmetic('add', path(variable('account'), 'balance'), pointCost),
      }),
      variable('account'),
    ),
  ));

  const oldRevealed = path(trackValue, 'revealed');
  const newIndicatorIds: CoreExpression = policy.indicatorPolicy === 'standard-cap'
    ? map(
        filter(
          path(trackValue, 'candidates'),
          'candidate',
          all(
            compare('gte', path(variable('candidate'), 'ordinal'), revealedCount),
            compare(
              'lt',
              path(variable('candidate'), 'ordinal'),
              arithmetic('add', revealedCount, literal(policy.extraIndicatorsPerUse)),
            ),
          ),
        ),
        'candidate',
        path(variable('candidate'), 'tileId'),
      )
    : (() => {
        const cutoff = arithmetic('subtract', aggregate('count', liveEntries), literal(policy.extensionTilesPerUse));
        const moved = filter(liveEntries, 'entry', compare('gte', path(variable('entry'), 'ordinal'), cutoff));
        const physicalSpan = policy.extensionTilesPerUse / policy.extraIndicatorsPerUse;
        return map(
          filter(
            moved,
            'entry',
            compare(
              'eq',
              arithmetic(
                'modulo',
                arithmetic('subtract', path(variable('entry'), 'ordinal'), cutoff),
                literal(physicalSpan),
              ),
              literal(0),
            ),
          ),
          'entry',
          path(variable('entry'), 'entityId'),
        );
      })();
  const newRevealRecords = map(newIndicatorIds, 'tileId', record({
    tileId: variable('tileId'),
    audience: literal('all'),
    source: literal('super-riichi'),
  }));

  const operations: RewriteOperation[] = [
    {
      kind: 'set',
      path: ['world', 'entities', String(ledgerIndex), 'components', 'ledger', 'accounts'],
      value: updatedAccounts,
    },
    {
      kind: 'set',
      path: ['world', 'entities', String(trackIndex), 'components', 'revealTrack', 'declaredActors'],
      value: concat(declaredActors, list(variable('actorId'))),
    },
    {
      kind: 'set',
      path: ['world', 'entities', String(trackIndex), 'components', 'revealTrack', 'revealedCount'],
      value: choose(
        isSuper,
        arithmetic('add', revealedCount, literal(policy.extraIndicatorsPerUse)),
        revealedCount,
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', String(trackIndex), 'components', 'revealTrack', 'capacity'],
      value: choose(
        all(isSuper, { kind: 'boolean', value: policy.indicatorPolicy === 'unbounded-extend' }),
        arithmetic('add', path(trackValue, 'capacity'), literal(policy.extraIndicatorsPerUse)),
        path(trackValue, 'capacity'),
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', String(trackIndex), 'components', 'revealTrack', 'revealed'],
      value: choose(isSuper, concat(oldRevealed, newRevealRecords), oldRevealed),
    },
  ];
  if (policy.indicatorPolicy === 'unbounded-extend') {
    const cutoff = arithmetic('subtract', aggregate('count', liveEntries), literal(policy.extensionTilesPerUse));
    const retained = filter(liveEntries, 'entry', compare('lt', path(variable('entry'), 'ordinal'), cutoff));
    const moved = filter(liveEntries, 'entry', compare('gte', path(variable('entry'), 'ordinal'), cutoff));
    operations.push(
      { kind: 'set', path: ['world', 'zones', '0', 'entries'], value: retained },
      { kind: 'set', path: ['world', 'zones', '1', 'entries'], value: concat(moved, deadEntries) },
    );
  }
  const rewrite: RewriteProgram = { id: 'super-riichi.commit', operations };

  const inputSchema: DataSchema = {
    type: 'object',
    properties: { mode: { type: 'string', enum: ['standard', 'super'] } },
    required: ['mode'],
    additionalProperties: false,
  };
  assertDataSchema(inputSchema);
  const offer: ActionOfferContract = {
    actionId: 'declare-riichi',
    inputSchema,
    choices: [
      {
        id: 'standard',
        label: '立直',
        summary: `${policy.standardStake} 点供托。`,
        preview: { pointCost: policy.standardStake, extraIndicators: 0 },
      },
      {
        id: 'super',
        label: 'Super立直',
        summary: `${policy.superStake} 点供托，额外公开 ${policy.extraIndicatorsPerUse} 张宝牌指示牌。`,
        preview: {
          pointCost: policy.superStake,
          extraIndicators: policy.extraIndicatorsPerUse,
          scope: policy.scope,
          indicatorPolicy: policy.indicatorPolicy,
          wallExtensionTiles: policy.indicatorPolicy === 'unbounded-extend' ? policy.extensionTilesPerUse : 0,
        },
      },
    ],
  };

  const source: WorldSource = {
    schemaVersion: 'mwl/0.4',
    id: `super-riichi-fixture:${policy.scope}:${policy.indicatorPolicy}`,
    entities: initialEntities,
    zones: [zone('wall.live', 'wall-live', liveTileIds), zone('wall.dead', 'wall-dead', deadTileIds)],
    relations: [],
    actions: [{
      id: 'declare-riichi',
      parameters: { mode: 'string' },
      requirements: [{
        id: 'declare-riichi.core-eligibility',
        kind: 'core.constraint',
        programId: eligibility.id,
        message: 'The selected riichi declaration is unavailable in the current world state.',
      }],
      effects: [
        { kind: 'core.rewrite', programId: rewrite.id },
        {
          kind: 'event.emit',
          eventType: 'riichi.declared',
          subjects: [{ kind: 'actor' }],
          payload: { mode: { kind: 'context', path: 'params.mode' }, ruleId: policy.id },
        },
      ],
    }],
    procedures: [],
    responseWindows: [],
    corePrograms: { constraints: [eligibility], reducers: [], rewrites: [rewrite] },
    bootstrap: [],
    metadata: {
      preset: 'fixture/super-riichi',
      actionOffers: [offer],
      policy,
      languageNotes: {
        scope: 'Expressed as an ordinary action constraint.',
        payment: 'Expressed as a generic resource-ledger rewrite.',
        reveal: 'Expressed as public records on an ordered reveal track.',
        unboundedWall: 'Expressed as a generic ordered-zone boundary migration.',
      },
    },
  };
  return { source, offer, policy };
}
