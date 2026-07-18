import { CapabilityRegistry } from './registry.js';
import type { CapabilityImplementation } from './types.js';

export type GroupPredicate =
  | { kind: 'all-equal'; path: string }
  | { kind: 'consecutive'; path: string; step?: number }
  | { kind: 'all-in'; path: string; values: unknown[] };

export interface PartitionItem {
  id: string;
  attributes: Record<string, unknown>;
}

export interface GroupAlternative {
  id: string;
  size: number;
  predicates: GroupPredicate[];
}

export interface GroupSlot {
  id: string;
  count: number;
  alternatives: GroupAlternative[];
}

export interface ExactCoverInput {
  items: PartitionItem[];
  slots: GroupSlot[];
  maxSolutions?: number;
}

export interface ExactCoverGroup {
  slotId: string;
  slotOrdinal: number;
  alternativeId: string;
  itemIds: string[];
}

export interface ExactCoverOutput {
  matched: boolean;
  solutions: ExactCoverGroup[][];
  exploredSteps: number;
}

interface ExpandedSlot {
  slotId: string;
  slotOrdinal: number;
  alternatives: GroupAlternative[];
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function matches(items: PartitionItem[], predicates: GroupPredicate[]): boolean {
  for (const predicate of predicates) {
    const values = items.map((item) => readPath(item.attributes, predicate.path));
    if (predicate.kind === 'all-equal') {
      if (values.length === 0 || values.some((value) => JSON.stringify(value) !== JSON.stringify(values[0]))) return false;
      continue;
    }
    if (predicate.kind === 'all-in') {
      if (values.some((value) => !predicate.values.some((allowed) => JSON.stringify(allowed) === JSON.stringify(value)))) return false;
      continue;
    }
    if (values.some((value) => typeof value !== 'number')) return false;
    const step = predicate.step ?? 1;
    const numbers = [...new Set(values as number[])].sort((left, right) => left - right);
    if (numbers.length !== values.length) return false;
    if (numbers.some((value, index) => index > 0 && value !== numbers[index - 1] + step)) return false;
  }
  return true;
}

function combinations<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  const current: T[] = [];
  const visit = (start: number) => {
    if (current.length === size) {
      output.push([...current]);
      return;
    }
    for (let index = start; index <= values.length - (size - current.length); index += 1) {
      current.push(values[index]);
      visit(index + 1);
      current.pop();
    }
  };
  visit(0);
  return output;
}

const exactCoverCapability: CapabilityImplementation<ExactCoverInput, ExactCoverOutput> = {
  descriptor: {
    id: 'core.partition.exact-cover',
    version: '1.0.0',
    kind: 'constraint',
    title: 'Exact-cover partition solver',
    description: 'Partitions arbitrary attributed entities into counted group slots whose alternatives are described by generic predicates.',
    inputSchema: {
      type: 'object',
      required: ['items', 'slots'],
      properties: {
        items: { type: 'array' },
        slots: { type: 'array' },
        maxSolutions: { type: 'integer', minimum: 1 },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['matched', 'solutions', 'exploredSteps'],
      properties: {
        matched: { type: 'boolean' },
        solutions: { type: 'array' },
        exploredSteps: { type: 'integer' },
      },
    },
    deterministic: true,
    purity: 'pure',
    reads: [],
    writes: [],
    budget: { maxSteps: 250000, maxOutputBytes: 1000000 },
  },
  invoke(input) {
    const maxSolutions = input.maxSolutions ?? 1;
    if (!Number.isInteger(maxSolutions) || maxSolutions < 1) throw new Error('maxSolutions must be positive.');
    const ids = new Set<string>();
    for (const item of input.items) {
      if (!item.id || ids.has(item.id)) throw new Error('Partition items need unique ids.');
      ids.add(item.id);
    }
    const expanded: ExpandedSlot[] = [];
    for (const slot of input.slots) {
      if (!slot.id || !Number.isInteger(slot.count) || slot.count < 0) throw new Error('Group slot count must be non-negative.');
      for (const alternative of slot.alternatives) {
        if (!alternative.id || !Number.isInteger(alternative.size) || alternative.size < 1) throw new Error('Group alternatives need positive size.');
      }
      for (let ordinal = 0; ordinal < slot.count; ordinal += 1) {
        expanded.push({ slotId: slot.id, slotOrdinal: ordinal, alternatives: slot.alternatives });
      }
    }
    const requiredSize = expanded.reduce((sum, slot) => sum + Math.min(...slot.alternatives.map((alternative) => alternative.size)), 0);
    if (expanded.some((slot) => slot.alternatives.some((alternative) => alternative.size !== slot.alternatives[0]?.size))) {
      // Different alternative arities are valid; the recursion below decides exact coverage.
    } else if (requiredSize !== input.items.length) {
      return { matched: false, solutions: [], exploredSteps: 0 };
    }

    const solutions: ExactCoverGroup[][] = [];
    let exploredSteps = 0;
    const search = (taskIndex: number, remaining: PartitionItem[], groups: ExactCoverGroup[]) => {
      if (solutions.length >= maxSolutions) return;
      exploredSteps += 1;
      if (exploredSteps > exactCoverCapability.descriptor.budget.maxSteps) throw new Error('Exact-cover step budget exceeded.');
      if (taskIndex === expanded.length) {
        if (remaining.length === 0) solutions.push(structuredClone(groups));
        return;
      }
      const task = expanded[taskIndex];
      for (const alternative of task.alternatives) {
        if (alternative.size > remaining.length) continue;
        for (const selected of combinations(remaining, alternative.size)) {
          exploredSteps += 1;
          if (exploredSteps > exactCoverCapability.descriptor.budget.maxSteps) throw new Error('Exact-cover step budget exceeded.');
          if (!matches(selected, alternative.predicates)) continue;
          const selectedIds = new Set(selected.map((item) => item.id));
          search(taskIndex + 1, remaining.filter((item) => !selectedIds.has(item.id)), [
            ...groups,
            {
              slotId: task.slotId,
              slotOrdinal: task.slotOrdinal,
              alternativeId: alternative.id,
              itemIds: selected.map((item) => item.id),
            },
          ]);
          if (solutions.length >= maxSolutions) return;
        }
      }
    };
    search(0, input.items, []);
    return { matched: solutions.length > 0, solutions, exploredSteps };
  },
};

export type NumericOperation = 'add' | 'multiply' | 'set' | 'min' | 'max';
export type NumericComparison = 'gte' | 'gt' | 'lte' | 'lt' | 'eq' | 'neq';

export interface NumericContribution {
  stage: string;
  dimension: string;
  operation: NumericOperation;
  value: number;
  sourceId?: string;
}

export interface NumericConstraint {
  afterStage: string;
  dimension: string;
  comparison: NumericComparison;
  value: number;
  code: string;
}

export interface NumericPipelineInput {
  initial?: Record<string, number>;
  stageOrder: string[];
  contributions: NumericContribution[];
  constraints?: NumericConstraint[];
}

export interface NumericPipelineOutput {
  valid: boolean;
  dimensions: Record<string, number>;
  failures: string[];
  trace: Array<{ stage: string; dimensions: Record<string, number> }>;
}

function compare(left: number, operation: NumericComparison, right: number): boolean {
  if (operation === 'gte') return left >= right;
  if (operation === 'gt') return left > right;
  if (operation === 'lte') return left <= right;
  if (operation === 'lt') return left < right;
  if (operation === 'eq') return left === right;
  return left !== right;
}

const numericPipelineCapability: CapabilityImplementation<NumericPipelineInput, NumericPipelineOutput> = {
  descriptor: {
    id: 'core.numeric.pipeline',
    version: '1.0.0',
    kind: 'reducer',
    title: 'Staged numeric contribution pipeline',
    description: 'Reduces signed contributions into arbitrary named dimensions and evaluates constraints at explicit stage boundaries.',
    inputSchema: {
      type: 'object',
      required: ['stageOrder', 'contributions'],
      properties: {
        initial: { type: 'object' },
        stageOrder: { type: 'array', items: { type: 'string' } },
        contributions: { type: 'array' },
        constraints: { type: 'array' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['valid', 'dimensions', 'failures', 'trace'],
      properties: {
        valid: { type: 'boolean' },
        dimensions: { type: 'object' },
        failures: { type: 'array', items: { type: 'string' } },
        trace: { type: 'array' },
      },
    },
    deterministic: true,
    purity: 'pure',
    reads: [],
    writes: [],
    budget: { maxSteps: 100000, maxOutputBytes: 500000 },
  },
  invoke(input) {
    const dimensions = structuredClone(input.initial ?? {});
    const failures: string[] = [];
    const trace: NumericPipelineOutput['trace'] = [];
    const stages = new Set(input.stageOrder);
    if (stages.size !== input.stageOrder.length) throw new Error('Numeric pipeline stages must be unique.');
    if (input.contributions.some((entry) => !stages.has(entry.stage))) throw new Error('Contribution references an unknown stage.');
    if ((input.constraints ?? []).some((entry) => !stages.has(entry.afterStage))) throw new Error('Constraint references an unknown stage.');

    let steps = 0;
    for (const stage of input.stageOrder) {
      for (const contribution of input.contributions.filter((entry) => entry.stage === stage)) {
        steps += 1;
        if (steps > numericPipelineCapability.descriptor.budget.maxSteps) throw new Error('Numeric pipeline step budget exceeded.');
        const current = dimensions[contribution.dimension] ?? 0;
        if (!Number.isFinite(contribution.value) || !Number.isFinite(current)) throw new Error('Numeric pipeline values must be finite.');
        if (contribution.operation === 'add') dimensions[contribution.dimension] = current + contribution.value;
        else if (contribution.operation === 'multiply') dimensions[contribution.dimension] = current * contribution.value;
        else if (contribution.operation === 'set') dimensions[contribution.dimension] = contribution.value;
        else if (contribution.operation === 'min') dimensions[contribution.dimension] = Math.min(current, contribution.value);
        else dimensions[contribution.dimension] = Math.max(current, contribution.value);
      }
      for (const constraint of (input.constraints ?? []).filter((entry) => entry.afterStage === stage)) {
        steps += 1;
        const value = dimensions[constraint.dimension] ?? 0;
        if (!compare(value, constraint.comparison, constraint.value)) failures.push(constraint.code);
      }
      trace.push({ stage, dimensions: structuredClone(dimensions) });
    }
    return { valid: failures.length === 0, dimensions, failures, trace };
  },
};

export function createCoreCapabilityRegistry(): CapabilityRegistry {
  return new CapabilityRegistry()
    .register(exactCoverCapability)
    .register(numericPipelineCapability);
}

export { exactCoverCapability, numericPipelineCapability };
