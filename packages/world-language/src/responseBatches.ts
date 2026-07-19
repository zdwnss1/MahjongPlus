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
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const aggregate = (operator: 'count' | 'sum' | 'min' | 'max', source: CoreExpression): CoreExpression => ({ kind: 'aggregate', operator, source });
const choose = (condition: CoreFormula, thenValue: CoreExpression, elseValue: CoreExpression): CoreExpression => ({
  kind: 'if', condition, then: thenValue, else: elseValue,
});
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
const concat = (...sources: CoreExpression[]): CoreExpression => ({ kind: 'concat', sources });
const distinct = (source: CoreExpression): CoreExpression => ({ kind: 'distinct', source });

export interface ProgressBatchMacroInput {
  id: string;
  batchesPath: string[];
  batches: CoreExpression;
  batchId: CoreExpression;
  batchKind: CoreExpression;
  sourceField?: string;
  sourceId: CoreExpression;
  items: CoreExpression;
  currentItemKey: CoreExpression;
  metadata?: CoreExpression;
}

/**
 * Generic compile-time expansion for a progress batch.
 *
 * The rewrite is safe to execute once per processed item. The first execution
 * creates the batch; later executions add a distinct processed key. The batch
 * becomes `ready` when every declared item has been processed.
 */
export function createProgressBatchRewrite(input: ProgressBatchMacroInput): RewriteProgram {
  if (!input.id) throw new Error('Progress batch rewrite id is required.');
  if (input.batchesPath.length === 0) throw new Error('Progress batch path cannot be empty.');
  const sourceField = input.sourceField ?? 'sourceId';
  if (!sourceField) throw new Error('Progress batch source field cannot be empty.');

  const batches = input.batches;
  const matching = filter(
    batches,
    'batch',
    compare('eq', path(variable('batch'), 'id'), input.batchId),
  );
  const existing = path(matching, '0');
  const existingProcessed = path(existing, 'processedKeys');
  const nextProcessed = distinct(concat(existingProcessed, list(input.currentItemKey)));
  const newProcessed = list(input.currentItemKey);
  const existingItems = path(existing, 'items');
  const readyExisting = compare('gte', aggregate('count', nextProcessed), aggregate('count', existingItems));
  const readyNew = compare('gte', aggregate('count', newProcessed), aggregate('count', input.items));

  const updatedExisting = record({
    id: path(existing, 'id'),
    kind: path(existing, 'kind'),
    [sourceField]: path(existing, sourceField),
    items: existingItems,
    processedKeys: nextProcessed,
    state: choose(readyExisting, literal('ready'), literal('collecting')),
    metadata: path(existing, 'metadata'),
  });
  const created = record({
    id: input.batchId,
    kind: input.batchKind,
    [sourceField]: input.sourceId,
    items: input.items,
    processedKeys: newProcessed,
    state: choose(readyNew, literal('ready'), literal('collecting')),
    metadata: input.metadata ?? literal({}),
  });

  const updatedBatches = choose(
    compare('eq', aggregate('count', matching), literal(0)),
    concat(batches, list(created)),
    map(
      batches,
      'batch',
      choose(
        compare('eq', path(variable('batch'), 'id'), input.batchId),
        updatedExisting,
        variable('batch'),
      ),
    ),
  );

  return {
    id: input.id,
    operations: [{ kind: 'set', path: [...input.batchesPath], value: updatedBatches }],
  };
}

export interface ResponseBatchProgressMacroInput {
  id: string;
  batchesPath: string[];
  batches: CoreExpression;
  batchId: CoreExpression;
  batchKind: CoreExpression;
  sourceWindowId: CoreExpression;
  items: CoreExpression;
  currentItemKey: CoreExpression;
  metadata?: CoreExpression;
}

/** Response-window convenience wrapper over the generic progress batch. */
export function createResponseBatchProgressRewrite(
  input: ResponseBatchProgressMacroInput,
): RewriteProgram {
  return createProgressBatchRewrite({
    id: input.id,
    batchesPath: input.batchesPath,
    batches: input.batches,
    batchId: input.batchId,
    batchKind: input.batchKind,
    sourceField: 'sourceWindowId',
    sourceId: input.sourceWindowId,
    items: input.items,
    currentItemKey: input.currentItemKey,
    metadata: input.metadata,
  });
}

/**
 * Generic continuation gate: the caller may proceed only when no response
 * window remains open in the world entity graph.
 */
export function createNoOpenResponseWindowsConstraint(
  id: string,
  entities: CoreExpression = path(variable('world'), 'entities'),
): FiniteDomainProgram {
  if (!id) throw new Error('Response-window gate id is required.');
  const openWindows = filter(
    entities,
    'entity',
    {
      kind: 'all',
      values: [
        compare('eq', path(variable('entity'), 'kind'), literal('response-window')),
        compare('eq', path(variable('entity'), 'components', 'responseWindow', 'state'), literal('open')),
      ],
    },
  );
  return {
    id,
    variables: [],
    constraints: [compare('eq', aggregate('count', openWindows), literal(0))],
    maxSolutions: 1,
    maxSteps: 100_000,
  };
}
