import type {
  CoreExpression,
  CoreFormula,
  FiniteDomainProgram,
} from '@mahjongplus/world-calculus';
import type {
  RegisteredContributionDefinition,
  RegisteredEligibilityRule,
} from './registeredContributionEvaluation.js';

export interface MaterializedAwardContribution {
  dimension: string;
  operation: 'add' | 'set';
  value: number | string;
}

export interface MaterializedEligibilityArtifact {
  eligibility: FiniteDomainProgram;
  award: {
    contributions: MaterializedAwardContribution[];
  };
}

export interface EligibilityArtifactAdapterDefinition {
  id: string;
  title?: string;
  artifact: MaterializedEligibilityArtifact;
  /** Maps every free artifact variable into the normalized evaluation context. */
  variableBindings: Record<string, CoreExpression>;
  contributionStage: string;
  qualification?: {
    amount: number;
    stage: string;
  };
}

function collectExpressionVariables(
  expression: CoreExpression,
  output: Set<string>,
  bound: Set<string>,
): void {
  if (expression.kind === 'variable') {
    if (!bound.has(expression.name)) output.add(expression.name);
    return;
  }
  if (expression.kind === 'literal') return;
  if (expression.kind === 'path') {
    collectExpressionVariables(expression.target, output, bound);
    return;
  }
  if (expression.kind === 'list') {
    expression.items.forEach((entry) => collectExpressionVariables(entry, output, bound));
    return;
  }
  if (expression.kind === 'record') {
    Object.values(expression.fields).forEach((entry) => collectExpressionVariables(entry, output, bound));
    return;
  }
  if (expression.kind === 'if') {
    collectFormulaVariables(expression.condition, output, bound);
    collectExpressionVariables(expression.then, output, bound);
    collectExpressionVariables(expression.else, output, bound);
    return;
  }
  if (expression.kind === 'arithmetic') {
    collectExpressionVariables(expression.left, output, bound);
    collectExpressionVariables(expression.right, output, bound);
    return;
  }
  if (expression.kind === 'filter') {
    collectExpressionVariables(expression.source, output, bound);
    collectFormulaVariables(expression.where, output, new Set(bound).add(expression.as));
    return;
  }
  if (expression.kind === 'map') {
    collectExpressionVariables(expression.source, output, bound);
    collectExpressionVariables(expression.select, output, new Set(bound).add(expression.as));
    return;
  }
  if (expression.kind === 'concat') {
    expression.sources.forEach((entry) => collectExpressionVariables(entry, output, bound));
    return;
  }
  if (expression.kind === 'flatten' || expression.kind === 'distinct') {
    collectExpressionVariables(expression.source, output, bound);
    return;
  }
  collectExpressionVariables(expression.source, output, bound);
  if (expression.value) {
    collectExpressionVariables(expression.value, output, new Set(bound).add(expression.as ?? 'item'));
  }
}

function collectFormulaVariables(
  formula: CoreFormula,
  output: Set<string>,
  bound: Set<string>,
): void {
  if (formula.kind === 'boolean') return;
  if (formula.kind === 'not') {
    collectFormulaVariables(formula.value, output, bound);
    return;
  }
  if (formula.kind === 'all' || formula.kind === 'any') {
    formula.values.forEach((entry) => collectFormulaVariables(entry, output, bound));
    return;
  }
  if (formula.kind === 'compare') {
    collectExpressionVariables(formula.left, output, bound);
    collectExpressionVariables(formula.right, output, bound);
    return;
  }
  if (formula.kind === 'contains') {
    collectExpressionVariables(formula.collection, output, bound);
    collectExpressionVariables(formula.value, output, bound);
    return;
  }
  collectExpressionVariables(formula.source, output, bound);
  collectFormulaVariables(formula.where, output, new Set(bound).add(formula.as));
}

function substituteExpression(
  expression: CoreExpression,
  replacements: Record<string, CoreExpression>,
  bound = new Set<string>(),
): CoreExpression {
  if (expression.kind === 'literal') return structuredClone(expression);
  if (expression.kind === 'variable') {
    return !bound.has(expression.name) && replacements[expression.name]
      ? structuredClone(replacements[expression.name])
      : structuredClone(expression);
  }
  if (expression.kind === 'path') return { ...expression, target: substituteExpression(expression.target, replacements, bound) };
  if (expression.kind === 'list') return { ...expression, items: expression.items.map((entry) => substituteExpression(entry, replacements, bound)) };
  if (expression.kind === 'record') {
    return {
      ...expression,
      fields: Object.fromEntries(Object.entries(expression.fields)
        .map(([key, value]) => [key, substituteExpression(value, replacements, bound)])),
    };
  }
  if (expression.kind === 'if') {
    return {
      ...expression,
      condition: substituteFormula(expression.condition, replacements, bound),
      then: substituteExpression(expression.then, replacements, bound),
      else: substituteExpression(expression.else, replacements, bound),
    };
  }
  if (expression.kind === 'arithmetic') {
    return {
      ...expression,
      left: substituteExpression(expression.left, replacements, bound),
      right: substituteExpression(expression.right, replacements, bound),
    };
  }
  if (expression.kind === 'filter') {
    return {
      ...expression,
      source: substituteExpression(expression.source, replacements, bound),
      where: substituteFormula(expression.where, replacements, new Set(bound).add(expression.as)),
    };
  }
  if (expression.kind === 'map') {
    return {
      ...expression,
      source: substituteExpression(expression.source, replacements, bound),
      select: substituteExpression(expression.select, replacements, new Set(bound).add(expression.as)),
    };
  }
  if (expression.kind === 'concat') return { ...expression, sources: expression.sources.map((entry) => substituteExpression(entry, replacements, bound)) };
  if (expression.kind === 'flatten' || expression.kind === 'distinct') {
    return { ...expression, source: substituteExpression(expression.source, replacements, bound) };
  }
  return {
    ...expression,
    source: substituteExpression(expression.source, replacements, bound),
    value: expression.value
      ? substituteExpression(expression.value, replacements, new Set(bound).add(expression.as ?? 'item'))
      : undefined,
  };
}

function substituteFormula(
  formula: CoreFormula,
  replacements: Record<string, CoreExpression>,
  bound = new Set<string>(),
): CoreFormula {
  if (formula.kind === 'boolean') return structuredClone(formula);
  if (formula.kind === 'not') return { ...formula, value: substituteFormula(formula.value, replacements, bound) };
  if (formula.kind === 'all' || formula.kind === 'any') {
    return { ...formula, values: formula.values.map((entry) => substituteFormula(entry, replacements, bound)) };
  }
  if (formula.kind === 'compare') {
    return {
      ...formula,
      left: substituteExpression(formula.left, replacements, bound),
      right: substituteExpression(formula.right, replacements, bound),
    };
  }
  if (formula.kind === 'contains') {
    return {
      ...formula,
      collection: substituteExpression(formula.collection, replacements, bound),
      value: substituteExpression(formula.value, replacements, bound),
    };
  }
  return {
    ...formula,
    source: substituteExpression(formula.source, replacements, bound),
    where: substituteFormula(formula.where, replacements, new Set(bound).add(formula.as)),
  };
}

/**
 * Adapts a materialized, variable-free finite-domain eligibility artifact into
 * the registered contribution pipeline. The adapter does not inspect rule ids
 * or Mahjong concepts; every external variable must have an explicit binding.
 */
export function adaptEligibilityArtifactToRegisteredRule(
  definition: EligibilityArtifactAdapterDefinition,
): RegisteredEligibilityRule {
  if (!definition.id) throw new Error('Adapted eligibility rule id is required.');
  if (definition.artifact.eligibility.variables.length > 0) {
    throw new Error('Eligibility artifacts with solver variables require a separate finite-domain adapter.');
  }
  const formula: CoreFormula = definition.artifact.eligibility.constraints.length === 0
    ? { kind: 'boolean', value: true }
    : definition.artifact.eligibility.constraints.length === 1
      ? structuredClone(definition.artifact.eligibility.constraints[0])
      : { kind: 'all', values: structuredClone(definition.artifact.eligibility.constraints) };
  const freeVariables = new Set<string>();
  collectFormulaVariables(formula, freeVariables, new Set());
  const missing = [...freeVariables].filter((name) => !definition.variableBindings[name]).sort();
  const extra = Object.keys(definition.variableBindings).filter((name) => !freeVariables.has(name)).sort();
  if (missing.length > 0) throw new Error(`Missing eligibility variable bindings: ${missing.join(', ')}`);
  if (extra.length > 0) throw new Error(`Unused eligibility variable bindings: ${extra.join(', ')}`);

  const contributions: RegisteredContributionDefinition[] = definition.artifact.award.contributions.map((entry) => {
    if (typeof entry.value !== 'number' && typeof entry.value !== 'string') {
      throw new Error(`Eligibility award ${definition.id}/${entry.dimension} is not materialized.`);
    }
    return {
      dimension: entry.dimension,
      operation: entry.operation,
      value: entry.value,
      stage: definition.contributionStage,
    };
  });
  if (contributions.length === 0) throw new Error('Adapted eligibility rule requires at least one award contribution.');
  return {
    id: definition.id,
    title: definition.title,
    predicate: substituteFormula(formula, definition.variableBindings),
    contributions,
    qualification: definition.qualification ?? {
      amount: 1,
      stage: definition.contributionStage,
    },
  };
}
