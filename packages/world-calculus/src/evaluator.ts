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

export function evaluateExpression(expression: CoreExpression, environment: CoreEvaluationEnvironment): unknown {
  switch (expression.kind) {
    case 'literal': return clone(expression.value);
    case 'variable': return clone(environment.variables[expression.name]);
    case 'path': return clone(readPath(evaluateExpression(expression.target, environment), expression.path));
    case 'list': return expression.items.map((item) => evaluateExpression(item, environment));
    case 'record': return Object.fromEntries(Object.entries(expression.fields)
      .map(([key, value]) => [key, evaluateExpression(value, environment)]));
    case 'if': return evaluateFormula(expression.condition, environment)
      ? evaluateExpression(expression.then, environment)
      : evaluateExpression(expression.else, environment);
    case 'arithmetic': {
      const left = asNumber(evaluateExpression(expression.left, environment));
      const right = asNumber(evaluateExpression(expression.right, environment));
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
    case 'filter': return asArray(evaluateExpression(expression.source, environment))
      .filter((entry) => evaluateFormula(expression.where, withVariable(environment, expression.as, entry)))
      .map(clone);
    case 'map': return asArray(evaluateExpression(expression.source, environment))
      .map((entry) => evaluateExpression(expression.select, withVariable(environment, expression.as, entry)));
    case 'concat': return expression.sources
      .flatMap((source) => asArray(evaluateExpression(source, environment)))
      .map(clone);
    case 'flatten': return asArray(evaluateExpression(expression.source, environment))
      .flatMap((entry) => asArray(entry))
      .map(clone);
    case 'distinct': {
      const seen = new Set<string>();
      return asArray(evaluateExpression(expression.source, environment)).filter((entry) => {
        const key = JSON.stringify(entry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(clone);
    }
    case 'aggregate': {
      const source = asArray(evaluateExpression(expression.source, environment));
      if (expression.operator === 'count') return source.length;
      const values = expression.value
        ? source.map((entry) => evaluateExpression(
            expression.value as CoreExpression,
            withVariable(environment, expression.as ?? 'item', entry),
          ))
        : source;
      const numbers = values.map(asNumber);
      if (expression.operator === 'sum') return numbers.reduce((sum, value) => sum + value, 0);
      if (numbers.length === 0) return null;
      return expression.operator === 'min' ? Math.min(...numbers) : Math.max(...numbers);
    }
  }
}

export function evaluateFormula(formula: CoreFormula, environment: CoreEvaluationEnvironment): boolean {
  switch (formula.kind) {
    case 'boolean': return formula.value;
    case 'not': return !evaluateFormula(formula.value, environment);
    case 'all': return formula.values.every((value) => evaluateFormula(value, environment));
    case 'any': return formula.values.some((value) => evaluateFormula(value, environment));
    case 'contains': return asArray(evaluateExpression(formula.collection, environment))
      .some((entry) => primitiveEqual(entry, evaluateExpression(formula.value, environment)));
    case 'quantify': {
      const values = asArray(evaluateExpression(formula.source, environment));
      return formula.quantifier === 'exists'
        ? values.some((entry) => evaluateFormula(formula.where, withVariable(environment, formula.as, entry)))
        : values.every((entry) => evaluateFormula(formula.where, withVariable(environment, formula.as, entry)));
    }
    case 'compare': {
      const left = evaluateExpression(formula.left, environment);
      const right = evaluateExpression(formula.right, environment);
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
