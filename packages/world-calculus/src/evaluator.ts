import type { CoreEvaluationEnvironment, CoreExpression, CoreFormula } from './types.js';

const clone = <T>(value: T): T => structuredClone(value);

function primitiveEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expression did not evaluate to an array.');
  return value;
}

function asNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Expression did not evaluate to a finite number.');
  }
  return value;
}

function withVariable(environment: CoreEvaluationEnvironment, name: string, value: unknown): CoreEvaluationEnvironment {
  return { variables: { ...environment.variables, [name]: value } };
}

export function readPath(target: unknown, path: readonly string[]): unknown {
  let current = target;
  for (const part of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function output<T>(value: T, readonly: boolean): T {
  return readonly ? value : clone(value);
}

function evaluateExpressionInternal(
  expression: CoreExpression,
  environment: CoreEvaluationEnvironment,
  readonly: boolean,
): unknown {
  const expressionValue = (value: CoreExpression) => evaluateExpressionInternal(value, environment, readonly);
  const formulaValue = (value: CoreFormula) => evaluateFormulaInternal(value, environment, readonly);
  switch (expression.kind) {
    case 'literal': return output(expression.value, readonly);
    case 'variable': return output(environment.variables[expression.name], readonly);
    case 'path': return output(readPath(expressionValue(expression.target), expression.path), readonly);
    case 'list': return expression.items.map(expressionValue);
    case 'record': return Object.fromEntries(Object.entries(expression.fields)
      .map(([key, value]) => [key, expressionValue(value)]));
    case 'if': return formulaValue(expression.condition)
      ? expressionValue(expression.then)
      : expressionValue(expression.else);
    case 'arithmetic': {
      const left = asNumber(expressionValue(expression.left));
      const right = asNumber(expressionValue(expression.right));
      if (expression.operator === 'add') return left + right;
      if (expression.operator === 'subtract') return left - right;
      if (expression.operator === 'multiply') return left * right;
      if (expression.operator === 'divide') {
        if (right === 0) throw new Error('Division by zero.');
        return left / right;
      }
      if (right === 0) throw new Error('Modulo by zero.');
      return left % right;
    }
    case 'filter': return asArray(expressionValue(expression.source))
      .filter((entry) => evaluateFormulaInternal(
        expression.where,
        withVariable(environment, expression.as, entry),
        readonly,
      ))
      .map((entry) => output(entry, readonly));
    case 'map': return asArray(expressionValue(expression.source))
      .map((entry) => evaluateExpressionInternal(
        expression.select,
        withVariable(environment, expression.as, entry),
        readonly,
      ));
    case 'concat': return expression.sources
      .flatMap((source) => asArray(expressionValue(source)))
      .map((entry) => output(entry, readonly));
    case 'flatten': return asArray(expressionValue(expression.source))
      .flatMap((entry) => asArray(entry))
      .map((entry) => output(entry, readonly));
    case 'distinct': {
      const seen = new Set<string>();
      return asArray(expressionValue(expression.source)).filter((entry) => {
        const key = JSON.stringify(entry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((entry) => output(entry, readonly));
    }
    case 'aggregate': {
      const source = asArray(expressionValue(expression.source));
      if (expression.operator === 'count') return source.length;
      const values = expression.value
        ? source.map((entry) => evaluateExpressionInternal(
            expression.value as CoreExpression,
            withVariable(environment, expression.as ?? 'item', entry),
            readonly,
          ))
        : source;
      const numbers = values.map(asNumber);
      if (expression.operator === 'sum') return numbers.reduce((sum, value) => sum + value, 0);
      if (numbers.length === 0) return null;
      return expression.operator === 'min' ? Math.min(...numbers) : Math.max(...numbers);
    }
  }
}

function evaluateFormulaInternal(
  formula: CoreFormula,
  environment: CoreEvaluationEnvironment,
  readonly: boolean,
): boolean {
  const expressionValue = (value: CoreExpression) => evaluateExpressionInternal(value, environment, readonly);
  const formulaValue = (value: CoreFormula) => evaluateFormulaInternal(value, environment, readonly);
  switch (formula.kind) {
    case 'boolean': return formula.value;
    case 'not': return !formulaValue(formula.value);
    case 'all': return formula.values.every(formulaValue);
    case 'any': return formula.values.some(formulaValue);
    case 'contains': return asArray(expressionValue(formula.collection))
      .some((entry) => primitiveEqual(entry, expressionValue(formula.value)));
    case 'quantify': {
      const values = asArray(expressionValue(formula.source));
      return formula.quantifier === 'exists'
        ? values.some((entry) => evaluateFormulaInternal(
            formula.where,
            withVariable(environment, formula.as, entry),
            readonly,
          ))
        : values.every((entry) => evaluateFormulaInternal(
            formula.where,
            withVariable(environment, formula.as, entry),
            readonly,
          ));
    }
    case 'compare': {
      const left = expressionValue(formula.left);
      const right = expressionValue(formula.right);
      if (formula.operator === 'eq') return primitiveEqual(left, right);
      if (formula.operator === 'neq') return !primitiveEqual(left, right);
      if (typeof left !== 'number' || typeof right !== 'number') {
        throw new Error(`Comparison ${formula.operator} requires numbers.`);
      }
      if (formula.operator === 'lt') return left < right;
      if (formula.operator === 'lte') return left <= right;
      if (formula.operator === 'gt') return left > right;
      return left >= right;
    }
  }
}

/** Isolated expression evaluator for callers that receive object values. */
export function evaluateExpression(expression: CoreExpression, environment: CoreEvaluationEnvironment): unknown {
  return evaluateExpressionInternal(expression, environment, false);
}

/**
 * Formula evaluation is intrinsically read-only and returns only a boolean, so it can avoid copying
 * large world graphs while preserving the same closed expression semantics.
 */
export function evaluateFormula(formula: CoreFormula, environment: CoreEvaluationEnvironment): boolean {
  return evaluateFormulaInternal(formula, environment, true);
}

/**
 * Read-only evaluator for pure compiler backends. It returns references into the supplied environment
 * and must never be exposed to mutating callbacks. The expression language itself has no mutation nodes.
 */
export function evaluateExpressionReadonly(expression: CoreExpression, environment: CoreEvaluationEnvironment): unknown {
  return evaluateExpressionInternal(expression, environment, true);
}

/** Read-only formula evaluation for bounded compiler optimizations. */
export function evaluateFormulaReadonly(formula: CoreFormula, environment: CoreEvaluationEnvironment): boolean {
  return evaluateFormulaInternal(formula, environment, true);
}
