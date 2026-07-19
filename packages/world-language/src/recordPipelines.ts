import type {
  CoreExpression,
  CoreFormula,
  FiniteDomainProgram,
  RewriteProgram,
} from '@mahjongplus/world-calculus';

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (...values: CoreFormula[]): CoreFormula => ({ kind: 'all', values });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const aggregate = (operator: 'count' | 'sum' | 'min' | 'max', source: CoreExpression): CoreExpression => ({ kind: 'aggregate', operator, source });
const arithmetic = (
  operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo',
  left: CoreExpression,
  right: CoreExpression,
): CoreExpression => ({ kind: 'arithmetic', operator, left, right });
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const quantify = (
  quantifier: 'exists' | 'forall',
  source: CoreExpression,
  as: string,
  where: CoreFormula,
): CoreFormula => ({ kind: 'quantify', quantifier, source, as, where });

export interface NoMatchingRecordsConstraintInput {
  id: string;
  records: CoreExpression;
  where: CoreFormula;
  as?: string;
  maxSteps?: number;
}

/** Generic gate over a record collection. */
export function createNoMatchingRecordsConstraint(
  input: NoMatchingRecordsConstraintInput,
): FiniteDomainProgram {
  if (!input.id) throw new Error('Record gate id is required.');
  const matching = filter(input.records, input.as ?? 'record', input.where);
  return {
    id: input.id,
    variables: [],
    constraints: [compare('eq', aggregate('count', matching), literal(0))],
    maxSolutions: 1,
    maxSteps: input.maxSteps ?? 100_000,
  };
}

export interface SimpleLedgerTransferShape {
  accountIdField?: string;
  balanceField?: string;
  fromAccountField?: string;
  toAccountField?: string;
  amountField?: string;
  assetField?: string;
}

export interface SimpleLedgerTransferFeasibilityInput extends SimpleLedgerTransferShape {
  id: string;
  accounts: CoreExpression;
  transfers: CoreExpression;
  minimumBalance?: CoreExpression;
  expectedAsset?: CoreExpression;
  maxSteps?: number;
}

function transferFields(input: SimpleLedgerTransferShape) {
  return {
    accountId: input.accountIdField ?? 'id',
    balance: input.balanceField ?? 'balance',
    from: input.fromAccountField ?? 'fromAccountId',
    to: input.toAccountField ?? 'toAccountId',
    amount: input.amountField ?? 'amount',
    asset: input.assetField ?? 'asset',
  };
}

function sumForAccount(
  transfers: CoreExpression,
  account: CoreExpression,
  transferField: string,
  fields: ReturnType<typeof transferFields>,
): CoreExpression {
  return aggregate('sum', map(
    filter(
      transfers,
      'transfer',
      compare(
        'eq',
        path(variable('transfer'), transferField),
        path(account, fields.accountId),
      ),
    ),
    'transfer',
    path(variable('transfer'), fields.amount),
  ));
}

function resultingBalance(
  accounts: CoreExpression,
  transfers: CoreExpression,
  fields: ReturnType<typeof transferFields>,
): CoreExpression {
  const account = variable('account');
  const outgoing = sumForAccount(transfers, account, fields.from, fields);
  const incoming = sumForAccount(transfers, account, fields.to, fields);
  return arithmetic(
    'add',
    arithmetic('subtract', path(account, fields.balance), outgoing),
    incoming,
  );
}

/**
 * Checks the transfer set as one atomic unit. A payer must be able to fund the
 * aggregate of all outgoing transfers, not merely every transfer in isolation.
 */
export function createSimpleLedgerTransferFeasibilityConstraint(
  input: SimpleLedgerTransferFeasibilityInput,
): FiniteDomainProgram {
  if (!input.id) throw new Error('Ledger feasibility id is required.');
  const fields = transferFields(input);
  const minimumBalance = input.minimumBalance ?? literal(0);
  const transfer = variable('transfer');
  const fromMatches = filter(
    input.accounts,
    'candidate',
    compare('eq', path(variable('candidate'), fields.accountId), path(transfer, fields.from)),
  );
  const toMatches = filter(
    input.accounts,
    'candidate',
    compare('eq', path(variable('candidate'), fields.accountId), path(transfer, fields.to)),
  );
  const transferValid = all(
    compare('gt', path(transfer, fields.amount), literal(0)),
    compare('eq', aggregate('count', fromMatches), literal(1)),
    compare('eq', aggregate('count', toMatches), literal(1)),
    ...(input.expectedAsset
      ? [compare('eq', path(transfer, fields.asset), input.expectedAsset)]
      : []),
  );
  const balancesValid = quantify(
    'forall',
    input.accounts,
    'account',
    compare('gte', resultingBalance(input.accounts, input.transfers, fields), minimumBalance),
  );
  return {
    id: input.id,
    variables: [],
    constraints: [
      quantify('forall', input.transfers, 'transfer', transferValid),
      balancesValid,
    ],
    maxSolutions: 1,
    maxSteps: input.maxSteps ?? 100_000,
  };
}

export interface SimpleLedgerTransferCommitInput extends SimpleLedgerTransferShape {
  id: string;
  accountsPath: string[];
  accounts: CoreExpression;
  transfers: CoreExpression;
}

/** Applies a previously validated transfer set to every account in one rewrite. */
export function createSimpleLedgerTransferCommitRewrite(
  input: SimpleLedgerTransferCommitInput,
): RewriteProgram {
  if (!input.id) throw new Error('Ledger commit rewrite id is required.');
  if (input.accountsPath.length === 0) throw new Error('Ledger accounts path cannot be empty.');
  const fields = transferFields(input);
  const account = variable('account');
  const updatedAccounts = map(input.accounts, 'account', record({
    [fields.accountId]: path(account, fields.accountId),
    [fields.balance]: resultingBalance(input.accounts, input.transfers, fields),
  }));
  return {
    id: input.id,
    operations: [{ kind: 'set', path: [...input.accountsPath], value: updatedAccounts }],
  };
}
