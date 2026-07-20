import type { CoreExpression, CoreFormula, RewriteOperation } from '@mahjongplus/world-calculus';
import type { DataSchema } from './dataSchema.js';
import type { ParameterType, ValueExpression } from './ast.js';
import type {
  RuleModuleDefinition,
  RuleModuleParameterDefinition,
  RuleModulePatch,
} from './ruleModules.js';
import {
  compileSemanticQuery,
  compileSemanticValue,
  createActionSemanticContext,
  type SemanticBindingProfile,
  type SemanticQueryDefinition,
  type SemanticValueReference,
} from './semanticQuery.js';

export interface TransactionalFactTrackDefinition {
  id: string;
  factType: string;
  component?: string;
  recordsField?: string;
}

export interface TransactionalLedgerDefinition {
  binding: string;
  component?: string;
  accountsField?: string;
  accountIdField?: string;
  balanceField?: string;
  minimumBalance?: number;
}

export interface TransactionalLedgerTransferDefinition {
  ledger: string;
  from: SemanticValueReference;
  to: SemanticValueReference;
  amount: SemanticValueReference;
}

export interface TransactionalFactAppendDefinition {
  trackId: string;
  fields: Record<string, SemanticValueReference>;
}

export type TransactionalEventPayloadValue =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'actor' }
  | { kind: 'action-entity' }
  | { kind: 'parameter'; name: string };

export interface TransactionalEventDefinition {
  eventClass: string;
  subjects?: unknown[];
  objects?: unknown[];
  payload?: Record<string, TransactionalEventPayloadValue>;
}

export interface TransactionalFactActionDefinition {
  id: string;
  parameters?: Record<string, ParameterType>;
  inputSchema?: DataSchema;
  requirements?: unknown[];
  eligibility: SemanticQueryDefinition;
  transfers?: TransactionalLedgerTransferDefinition[];
  appendFacts?: TransactionalFactAppendDefinition[];
  events?: TransactionalEventDefinition[];
}

export interface TransactionalActionGateDefinition {
  id: string;
  actionId: string;
  message: string;
  allow: SemanticQueryDefinition;
  placement?: 'prepend' | 'append';
}

export interface TransactionalFactActionModuleDefinition {
  id: string;
  version: string;
  title?: string;
  description?: string;
  semanticProfile: SemanticBindingProfile;
  parameters?: RuleModuleParameterDefinition;
  requiredBindings?: string[];
  tracks?: TransactionalFactTrackDefinition[];
  ledgers?: TransactionalLedgerDefinition[];
  actions?: TransactionalFactActionDefinition[];
  gates?: TransactionalActionGateDefinition[];
  patches?: RuleModulePatch[];
  metadata?: Record<string, unknown>;
}

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const aggregate = (
  operator: 'count' | 'sum' | 'min' | 'max',
  source: CoreExpression,
  as?: string,
  value?: CoreExpression,
): CoreExpression => ({ kind: 'aggregate', operator, source, as, value });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (...values: CoreFormula[]): CoreFormula => ({ kind: 'all', values });

function payloadValue(value: TransactionalEventPayloadValue): ValueExpression | string | number | boolean | null {
  if (value.kind === 'literal') return value.value;
  if (value.kind === 'actor') return { kind: 'context', path: 'actorId' };
  if (value.kind === 'action-entity') return { kind: 'context', path: 'actionEntityId' };
  return { kind: 'context', path: `params.${value.name}` };
}

function eventType(profile: SemanticBindingProfile, eventClass: string): string {
  const values = profile.eventClasses[eventClass];
  if (!values || values.length !== 1) {
    throw new Error(`Transactional event class ${eventClass} must bind to exactly one event type.`);
  }
  return values[0];
}

function eventPayload(
  profile: SemanticBindingProfile,
  payload: Record<string, TransactionalEventPayloadValue> | undefined,
): Record<string, ValueExpression | string | number | boolean | null> | undefined {
  if (!payload) return undefined;
  return Object.fromEntries(Object.entries(payload).map(([semanticField, value]) => {
    const target = profile.eventPayloadFields?.[semanticField];
    if (!target) throw new Error(`Semantic profile ${profile.id} has no event payload field ${semanticField}.`);
    return [target, payloadValue(value)];
  }));
}

function ledgerIndex(binding: string): string {
  return ({ $module: 'entity-index', id: { $module: 'ref', path: `bindings.${binding}` } } as unknown) as string;
}

function trackIndex(id: string): string {
  return ({ $module: 'entity-index', id } as unknown) as string;
}

export function compileTransactionalFactActionModule(
  definition: TransactionalFactActionModuleDefinition,
): RuleModuleDefinition {
  const context = createActionSemanticContext();
  const world = variable('world');
  const entities = path(world, 'entities');
  const ledgerDefinitions = new Map((definition.ledgers ?? []).map((entry) => [entry.binding, entry]));
  const trackDefinitions = new Map((definition.tracks ?? []).map((entry) => [entry.id, entry]));
  const constraints: unknown[] = [];
  const rewrites: unknown[] = [];
  const actions: unknown[] = [];
  const generatedPatches: RuleModulePatch[] = [];

  for (const action of definition.actions ?? []) {
    const constraintId = `${definition.id}.${action.id}.eligible`;
    const rewriteId = `${definition.id}.${action.id}.commit`;
    const transfers = (action.transfers ?? []).map((transfer) => ({
      definition: transfer,
      from: compileSemanticValue(transfer.from, definition.semanticProfile, { context }),
      to: compileSemanticValue(transfer.to, definition.semanticProfile, { context }),
      amount: compileSemanticValue(transfer.amount, definition.semanticProfile, { context }),
    }));
    const transferRecords = list(...transfers.map((transfer) => record({
      from: transfer.from,
      to: transfer.to,
      amount: transfer.amount,
    })));
    const feasibility: CoreFormula[] = [];
    const operations: RewriteOperation[] = [];

    for (const ledgerBinding of new Set(transfers.map((entry) => entry.definition.ledger))) {
      const ledger = ledgerDefinitions.get(ledgerBinding);
      if (!ledger) throw new Error(`Action ${action.id} references unknown ledger ${ledgerBinding}.`);
      const component = ledger.component ?? 'ledger';
      const accountsField = ledger.accountsField ?? 'accounts';
      const accountIdField = ledger.accountIdField ?? 'id';
      const balanceField = ledger.balanceField ?? 'balance';
      const minimumBalance = ledger.minimumBalance ?? 0;
      const accounts = path(entities, ledgerIndex(ledgerBinding), 'components', component, accountsField);
      const relevantTransfers = filter(
        transferRecords,
        'transfer',
        { kind: 'boolean', value: true },
      );
      const updatedBalance = (accountVariable: string): CoreExpression => {
        const accountId = path(variable(accountVariable), accountIdField);
        const outgoing = filter(
          relevantTransfers,
          'outgoing',
          compare('eq', path(variable('outgoing'), 'from'), accountId),
        );
        const incoming = filter(
          relevantTransfers,
          'incoming',
          compare('eq', path(variable('incoming'), 'to'), accountId),
        );
        return {
          kind: 'arithmetic',
          operator: 'add',
          left: {
            kind: 'arithmetic',
            operator: 'subtract',
            left: path(variable(accountVariable), balanceField),
            right: aggregate('sum', outgoing, 'outgoing', path(variable('outgoing'), 'amount')),
          },
          right: aggregate('sum', incoming, 'incoming', path(variable('incoming'), 'amount')),
        };
      };
      feasibility.push({
        kind: 'quantify',
        quantifier: 'forall',
        source: accounts,
        as: 'account',
        where: compare('gte', updatedBalance('account'), literal(minimumBalance)),
      });
      operations.push({
        kind: 'set',
        path: ['world', 'entities', ledgerIndex(ledgerBinding), 'components', component, accountsField],
        value: {
          kind: 'map',
          source: accounts,
          as: 'account',
          select: record({
            [accountIdField]: path(variable('account'), accountIdField),
            [balanceField]: updatedBalance('account'),
          }),
        },
      });
    }

    for (const append of action.appendFacts ?? []) {
      const track = trackDefinitions.get(append.trackId);
      if (!track) throw new Error(`Action ${action.id} references unknown fact track ${append.trackId}.`);
      const component = track.component ?? 'factTrack';
      const recordsField = track.recordsField ?? 'records';
      operations.push({
        kind: 'append',
        path: ['world', 'entities', trackIndex(track.id), 'components', component, recordsField],
        value: record(Object.fromEntries(Object.entries(append.fields).map(([name, value]) => [
          name,
          compileSemanticValue(value, definition.semanticProfile, { context }),
        ]))),
      });
    }

    constraints.push({
      id: constraintId,
      variables: [],
      constraints: [all(
        compileSemanticQuery(action.eligibility, definition.semanticProfile, { context }),
        ...feasibility,
      )],
      maxSolutions: 1,
      maxSteps: 100_000,
    });
    rewrites.push({ id: rewriteId, operations });
    actions.push({
      id: action.id,
      parameters: action.parameters ?? {},
      inputSchema: action.inputSchema,
      requirements: [
        ...(action.requirements ?? []),
        {
          id: `${action.id}.semantic-eligibility`,
          kind: 'core.constraint',
          programId: constraintId,
          message: 'The semantic action conditions or transactional resource constraints are not satisfied.',
        },
      ],
      effects: [
        { kind: 'core.rewrite', programId: rewriteId },
        ...(action.events ?? []).map((event) => ({
          kind: 'event.emit',
          eventType: eventType(definition.semanticProfile, event.eventClass),
          subjects: event.subjects ?? [{ kind: 'actor' }],
          objects: event.objects,
          payload: eventPayload(definition.semanticProfile, event.payload),
        })),
      ],
    });
  }

  for (const gate of definition.gates ?? []) {
    const programId = `${definition.id}.${gate.id}`;
    constraints.push({
      id: programId,
      variables: [],
      constraints: [compileSemanticQuery(gate.allow, definition.semanticProfile, { context })],
      maxSolutions: 1,
      maxSteps: 100_000,
    });
    generatedPatches.push({
      kind: 'action.requirements',
      actionId: gate.actionId,
      placement: gate.placement ?? 'append',
      values: [{
        id: gate.id,
        kind: 'core.constraint',
        programId,
        message: gate.message,
      }],
    });
  }

  return {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    description: definition.description,
    parameters: structuredClone(definition.parameters),
    requiredBindings: structuredClone(definition.requiredBindings ?? []),
    additions: {
      entities: (definition.tracks ?? []).map((track) => ({
        id: track.id,
        kind: 'fact-track',
        components: {
          [track.component ?? 'factTrack']: {
            factType: track.factType,
            [track.recordsField ?? 'records']: [],
          },
        },
      })),
      actions,
      corePrograms: { constraints, reducers: [], rewrites },
    },
    patches: [...generatedPatches, ...(definition.patches ?? [])],
    artifacts: {
      semanticProfileId: definition.semanticProfile.id,
      actionIds: (definition.actions ?? []).map((action) => action.id),
      trackIds: (definition.tracks ?? []).map((track) => track.id),
      gateIds: (definition.gates ?? []).map((gate) => gate.id),
    },
    metadata: {
      ...(definition.metadata ?? {}),
      service: 'transactional-fact-actions',
      semanticBindingProfileId: definition.semanticProfile.id,
    },
  };
}
