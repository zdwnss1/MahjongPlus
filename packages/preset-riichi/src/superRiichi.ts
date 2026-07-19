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
  riichiHan?: number;
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

const FACT_TRACK_IDS = {
  transfers: 'track:resource-transfers',
  declarations: 'track:public-declarations',
  contributions: 'track:score-contributions',
  discardPolicies: 'track:discard-policies',
  furitenPolicies: 'track:furiten-policies',
} as const;

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

function factTrack(id: string, factType: string): EntityRecord {
  return {
    id,
    kind: 'fact-track',
    components: { factTrack: { factType, records: [] } },
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
    riichiHan: options.riichiHan ?? 1,
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
  if (policy.riichiHan < 0) throw new Error('riichiHan must not be negative.');
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
  const indicatorTrack: EntityRecord = {
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
  const factTracks = [
    factTrack(FACT_TRACK_IDS.transfers, 'resource-transfer'),
    factTrack(FACT_TRACK_IDS.declarations, 'public-declaration'),
    factTrack(FACT_TRACK_IDS.contributions, 'score-contribution'),
    factTrack(FACT_TRACK_IDS.discardPolicies, 'discard-policy'),
    factTrack(FACT_TRACK_IDS.furitenPolicies, 'furiten-policy'),
  ];
  const initialEntities = [...players, ledger, indicatorTrack, ...factTracks, rule, ...tiles];
  const entityIndex = (id: string): number => {
    const index = initialEntities.findIndex((entity) => entity.id === id);
    if (index < 0) throw new Error(`Missing fixture entity ${id}`);
    return index;
  };
  const ledgerIndex = entityIndex(ledger.id);
  const indicatorTrackIndex = entityIndex(indicatorTrack.id);
  const trackIndex = Object.fromEntries(Object.values(FACT_TRACK_IDS).map((id) => [id, entityIndex(id)])) as Record<string, number>;

  const player = firstMatching(entities, 'entity', compare('eq', path(variable('entity'), 'id'), variable('actorId')));
  const accounts = path(entities, String(ledgerIndex), 'components', 'ledger', 'accounts');
  const actorAccount = firstMatching(accounts, 'account', compare('eq', path(variable('account'), 'id'), variable('actorId')));
  const actorBalance = path(actorAccount, 'balance');
  const trackValue = path(entities, String(indicatorTrackIndex), 'components', 'revealTrack');
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
    correlationId: variable('actionEntityId'),
  }));

  const factRecord = (fields: Record<string, CoreExpression>): CoreExpression => record({
    correlationId: variable('actionEntityId'),
    sourceRuleId: literal(policy.id),
    actorId: variable('actorId'),
    mode,
    ...fields,
  });
  const trackRecordsPath = (id: string): string[] => [
    'world', 'entities', String(trackIndex[id]), 'components', 'factTrack', 'records',
  ];

  const operations: RewriteOperation[] = [
    {
      kind: 'set',
      path: ['world', 'entities', String(ledgerIndex), 'components', 'ledger', 'accounts'],
      value: updatedAccounts,
    },
    {
      kind: 'append',
      path: trackRecordsPath(FACT_TRACK_IDS.transfers),
      value: factRecord({
        asset: literal('points'),
        fromAccountId: variable('actorId'),
        toAccountId: literal('riichi-pot'),
        amount: pointCost,
      }),
    },
    {
      kind: 'append',
      path: trackRecordsPath(FACT_TRACK_IDS.declarations),
      value: factRecord({
        declarationType: literal('riichi'),
        audience: literal('all'),
        state: literal('published'),
      }),
    },
    {
      kind: 'append',
      path: trackRecordsPath(FACT_TRACK_IDS.contributions),
      value: factRecord({
        subjectId: variable('actorId'),
        dimension: literal('han'),
        operation: literal('add'),
        amount: literal(policy.riichiHan),
        stage: literal('base-yaku'),
        lifetime: literal('until-hand-end'),
      }),
    },
    {
      kind: 'append',
      path: trackRecordsPath(FACT_TRACK_IDS.discardPolicies),
      value: factRecord({
        subjectId: variable('actorId'),
        policyType: literal('discard-selection'),
        allowedSource: literal('latest-draw'),
        consequence: literal('reject'),
        lifetime: literal('until-hand-end'),
      }),
    },
    {
      kind: 'append',
      path: trackRecordsPath(FACT_TRACK_IDS.furitenPolicies),
      value: factRecord({
        subjectId: variable('actorId'),
        policyType: literal('missed-win-lock'),
        triggerEventType: literal('win-claim.passed'),
        resultingState: literal('furiten'),
        furitenClass: literal('riichi-pass'),
        lifetime: literal('until-hand-end'),
      }),
    },
    {
      kind: 'set',
      path: ['world', 'entities', String(indicatorTrackIndex), 'components', 'revealTrack', 'declaredActors'],
      value: concat(declaredActors, list(variable('actorId'))),
    },
    {
      kind: 'set',
      path: ['world', 'entities', String(indicatorTrackIndex), 'components', 'revealTrack', 'revealedCount'],
      value: choose(
        isSuper,
        arithmetic('add', revealedCount, literal(policy.extraIndicatorsPerUse)),
        revealedCount,
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', String(indicatorTrackIndex), 'components', 'revealTrack', 'capacity'],
      value: choose(
        all(isSuper, { kind: 'boolean', value: policy.indicatorPolicy === 'unbounded-extend' }),
        arithmetic('add', path(trackValue, 'capacity'), literal(policy.extraIndicatorsPerUse)),
        path(trackValue, 'capacity'),
      ),
    },
    {
      kind: 'set',
      path: ['world', 'entities', String(indicatorTrackIndex), 'components', 'revealTrack', 'revealed'],
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
        preview: { pointCost: policy.standardStake, extraIndicators: 0, han: policy.riichiHan },
      },
      {
        id: 'super',
        label: 'Super立直',
        summary: `${policy.superStake} 点供托，额外公开 ${policy.extraIndicatorsPerUse} 张宝牌指示牌。`,
        preview: {
          pointCost: policy.superStake,
          extraIndicators: policy.extraIndicatorsPerUse,
          han: policy.riichiHan,
          scope: policy.scope,
          indicatorPolicy: policy.indicatorPolicy,
          wallExtensionTiles: policy.indicatorPolicy === 'unbounded-extend' ? policy.extensionTilesPerUse : 0,
        },
      },
    ],
  };

  const staticEntity = (id: string, entityKind: string) => ({ kind: 'entity', entityKind, id: { kind: 'literal', value: id } } as const);
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
          eventType: 'resource.transferred',
          subjects: [{ kind: 'actor' }],
          objects: [staticEntity(ledger.id, 'resource-ledger'), staticEntity(FACT_TRACK_IDS.transfers, 'fact-track')],
          payload: { mode: { kind: 'context', path: 'params.mode' }, ruleId: policy.id },
        },
        {
          kind: 'event.emit',
          eventType: 'declaration.published',
          subjects: [{ kind: 'actor' }],
          objects: [staticEntity(FACT_TRACK_IDS.declarations, 'fact-track')],
          payload: { mode: { kind: 'context', path: 'params.mode' }, declarationType: 'riichi', ruleId: policy.id },
        },
        {
          kind: 'event.emit',
          eventType: 'score-contribution.granted',
          subjects: [{ kind: 'actor' }],
          objects: [staticEntity(FACT_TRACK_IDS.contributions, 'fact-track')],
          payload: { mode: { kind: 'context', path: 'params.mode' }, dimension: 'han', ruleId: policy.id },
        },
        {
          kind: 'event.emit',
          eventType: 'discard-policy.activated',
          subjects: [{ kind: 'actor' }],
          objects: [staticEntity(FACT_TRACK_IDS.discardPolicies, 'fact-track')],
          payload: { mode: { kind: 'context', path: 'params.mode' }, ruleId: policy.id },
        },
        {
          kind: 'event.emit',
          eventType: 'furiten-policy.activated',
          subjects: [{ kind: 'actor' }],
          objects: [staticEntity(FACT_TRACK_IDS.furitenPolicies, 'fact-track')],
          payload: { mode: { kind: 'context', path: 'params.mode' }, ruleId: policy.id },
        },
        {
          kind: 'event.emit',
          eventType: 'reveal-track.updated',
          subjects: [{ kind: 'actor' }],
          objects: [staticEntity(indicatorTrack.id, 'reveal-track')],
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
      factChannels: Object.values(FACT_TRACK_IDS),
      languageNotes: {
        atomicBundle: 'One action atomically commits independent facts sharing the same action/correlation id.',
        stake: 'Resource consumers read resource-transfer facts only.',
        scoring: 'Win evaluation reads score-contribution facts only.',
        discard: 'Discard adjudication reads discard-policy facts only.',
        furiten: 'Win-claim adjudication reads trigger-based furiten-policy facts only.',
        reveal: 'Observation and dora consumers read the reveal track only.',
      },
    },
  };
  return { source, offer, policy };
}
