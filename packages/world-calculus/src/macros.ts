import { evaluateFormula } from './evaluator.js';
import type {
  CoreExpression,
  CoreFormula,
  FiniteDomainProgram,
  FiniteDomainResult,
  FiniteDomainSolution,
  PartitionGroupAlternative,
  PartitionItemDefinition,
  PartitionMacroExpansion,
  PartitionMacroInput,
} from './types.js';

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });

function substituteExpression(expression: CoreExpression, name: string, replacement: CoreExpression): CoreExpression {
  if (expression.kind === 'variable') {
    return expression.name === name ? structuredClone(replacement) : structuredClone(expression);
  }
  if (expression.kind === 'literal') return structuredClone(expression);
  if (expression.kind === 'path') {
    return { ...expression, target: substituteExpression(expression.target, name, replacement) };
  }
  if (expression.kind === 'list') {
    return { ...expression, items: expression.items.map((entry) => substituteExpression(entry, name, replacement)) };
  }
  if (expression.kind === 'record') {
    return {
      ...expression,
      fields: Object.fromEntries(Object.entries(expression.fields)
        .map(([key, value]) => [key, substituteExpression(value, name, replacement)])),
    };
  }
  if (expression.kind === 'if') {
    return {
      ...expression,
      condition: substituteFormula(expression.condition, name, replacement),
      then: substituteExpression(expression.then, name, replacement),
      else: substituteExpression(expression.else, name, replacement),
    };
  }
  if (expression.kind === 'arithmetic') {
    return {
      ...expression,
      left: substituteExpression(expression.left, name, replacement),
      right: substituteExpression(expression.right, name, replacement),
    };
  }
  if (expression.kind === 'filter') {
    return expression.as === name ? structuredClone(expression) : {
      ...expression,
      source: substituteExpression(expression.source, name, replacement),
      where: substituteFormula(expression.where, name, replacement),
    };
  }
  if (expression.kind === 'map') {
    return expression.as === name ? structuredClone(expression) : {
      ...expression,
      source: substituteExpression(expression.source, name, replacement),
      select: substituteExpression(expression.select, name, replacement),
    };
  }
  if (expression.kind === 'concat') {
    return { ...expression, sources: expression.sources.map((entry) => substituteExpression(entry, name, replacement)) };
  }
  if (expression.kind === 'flatten' || expression.kind === 'distinct') {
    return { ...expression, source: substituteExpression(expression.source, name, replacement) };
  }
  return {
    ...expression,
    source: substituteExpression(expression.source, name, replacement),
    value: expression.value ? substituteExpression(expression.value, name, replacement) : undefined,
  };
}

function substituteFormula(formula: CoreFormula, name: string, replacement: CoreExpression): CoreFormula {
  if (formula.kind === 'boolean') return structuredClone(formula);
  if (formula.kind === 'not') return { ...formula, value: substituteFormula(formula.value, name, replacement) };
  if (formula.kind === 'all' || formula.kind === 'any') {
    return { ...formula, values: formula.values.map((entry) => substituteFormula(entry, name, replacement)) };
  }
  if (formula.kind === 'compare') {
    return {
      ...formula,
      left: substituteExpression(formula.left, name, replacement),
      right: substituteExpression(formula.right, name, replacement),
    };
  }
  if (formula.kind === 'contains') {
    return {
      ...formula,
      collection: substituteExpression(formula.collection, name, replacement),
      value: substituteExpression(formula.value, name, replacement),
    };
  }
  return formula.as === name ? structuredClone(formula) : {
    ...formula,
    source: substituteExpression(formula.source, name, replacement),
    where: substituteFormula(formula.where, name, replacement),
  };
}

function alternativePredicate(
  alternative: PartitionGroupAlternative,
  memberVariable: string,
  members: CoreExpression,
): CoreFormula {
  return substituteFormula(alternative.predicate, memberVariable, members);
}

export function expandPartitionMacro(input: PartitionMacroInput): PartitionMacroExpansion {
  const memberVariable = input.memberVariable ?? 'members';
  const instances = input.slots.flatMap((slot) => Array.from({ length: slot.count }, (_, ordinal) => ({
    id: `${slot.id}:${ordinal}`,
    slot,
  })));
  const domains = instances.map((entry) => entry.id);
  const variables = input.items.map((item) => ({ name: `assign:${item.id}`, domain: literal(domains) }));
  const itemRecords: CoreExpression = {
    kind: 'list',
    items: input.items.map((item) => ({
      kind: 'record',
      fields: {
        id: literal(item.id),
        attributes: literal(item.attributes),
        assigned: variable(`assign:${item.id}`),
      },
    })),
  };
  const constraints: CoreFormula[] = [];
  for (const instance of instances) {
    const members: CoreExpression = {
      kind: 'filter',
      source: itemRecords,
      as: 'entry',
      where: compare(
        'eq',
        { kind: 'path', target: variable('entry'), path: ['assigned'] },
        literal(instance.id),
      ),
    };
    constraints.push({
      kind: 'any',
      values: instance.slot.alternatives.map((alternative) => ({
        kind: 'all',
        values: [
          compare('eq', { kind: 'aggregate', operator: 'count', source: members }, literal(alternative.size)),
          alternativePredicate(alternative, memberVariable, members),
        ],
      })),
    });
  }
  const program: FiniteDomainProgram = {
    id: input.id,
    variables,
    constraints,
    outputs: {
      assignments: {
        kind: 'record',
        fields: Object.fromEntries(input.items.map((item) => [item.id, variable(`assign:${item.id}`)])),
      },
    },
    maxSolutions: input.maxSolutions,
    maxSteps: input.maxSteps,
  };
  return { input: structuredClone(input), program };
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

function compareSelectionKeys(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

interface PartitionCandidate {
  itemIds: string[];
  key: number[];
}

/** Compile-backend optimization. The semantic artifact remains expansion.program. */
export function solvePartitionExpansion(expansion: PartitionMacroExpansion): FiniteDomainResult {
  const input = expansion.input;
  const memberVariable = input.memberVariable ?? 'members';
  const instances = input.slots.flatMap((slot) => Array.from({ length: slot.count }, (_, ordinal) => ({
    id: `${slot.id}:${ordinal}`,
    slot,
  })));
  const maxSolutions = input.maxSolutions ?? 1;
  const maxSteps = input.maxSteps ?? 250_000;
  const solutions: FiniteDomainSolution[] = [];
  const itemOrder = new Map(input.items.map((item, index) => [item.id, index]));
  const itemsById = new Map(input.items.map((item) => [item.id, item]));
  let exploredSteps = 0;
  const step = () => {
    exploredSteps += 1;
    if (exploredSteps > maxSteps) throw new Error('Partition backend step budget exceeded.');
  };

  const candidatesBySlot = new Map<string, PartitionCandidate[]>();
  for (const slot of input.slots) {
    const candidates: PartitionCandidate[] = [];
    const seen = new Set<string>();
    for (const alternative of slot.alternatives) {
      for (const selected of combinations(input.items, alternative.size)) {
        step();
        const members = selected.map((item) => ({
          id: item.id,
          attributes: structuredClone(item.attributes),
          assigned: slot.id,
        }));
        if (!evaluateFormula(alternative.predicate, { variables: { [memberVariable]: members } })) continue;
        const key = selected
          .map((item) => itemOrder.get(item.id) as number)
          .sort((left, right) => left - right);
        const serialized = JSON.stringify(key);
        if (seen.has(serialized)) continue;
        seen.add(serialized);
        candidates.push({ itemIds: selected.map((item) => item.id), key });
      }
    }
    candidates.sort((left, right) => compareSelectionKeys(left.key, right.key));
    candidatesBySlot.set(slot.id, candidates);
  }

  const searchInstances = [...instances].sort((left, right) => {
    const candidateDifference = (candidatesBySlot.get(left.slot.id)?.length ?? 0)
      - (candidatesBySlot.get(right.slot.id)?.length ?? 0);
    if (candidateDifference !== 0) return candidateDifference;
    if (left.slot.id !== right.slot.id) return left.slot.id.localeCompare(right.slot.id);
    return left.id.localeCompare(right.id, undefined, { numeric: true });
  });

  const search = (
    index: number,
    remainingIds: Set<string>,
    assignment: Record<string, string>,
    previousSelections: Record<string, number[]>,
  ) => {
    if (solutions.length >= maxSolutions) return;
    step();
    if (index === searchInstances.length) {
      if (remainingIds.size === 0) {
        solutions.push({
          assignment: structuredClone(assignment),
          outputs: { assignments: structuredClone(assignment) },
        });
      }
      return;
    }
    const instance = searchInstances[index];
    const previousSelection = previousSelections[instance.slot.id];
    for (const candidate of candidatesBySlot.get(instance.slot.id) ?? []) {
      step();
      if (previousSelection && compareSelectionKeys(candidate.key, previousSelection) <= 0) continue;
      if (candidate.itemIds.some((id) => !remainingIds.has(id))) continue;
      const nextRemaining = new Set(remainingIds);
      const nextAssignment = { ...assignment };
      for (const id of candidate.itemIds) {
        if (!itemsById.has(id)) throw new Error(`Partition candidate references unknown item ${id}.`);
        nextRemaining.delete(id);
        nextAssignment[id] = instance.id;
      }
      search(
        index + 1,
        nextRemaining,
        nextAssignment,
        { ...previousSelections, [instance.slot.id]: candidate.key },
      );
      if (solutions.length >= maxSolutions) return;
    }
  };

  search(0, new Set(input.items.map((item) => item.id)), {}, {});
  return { satisfiable: solutions.length > 0, solutions, exploredSteps };
}
