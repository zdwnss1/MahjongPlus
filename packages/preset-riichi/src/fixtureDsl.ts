import type {
  CoreExpression,
  CoreFormula,
  FiniteDomainProgram,
} from '@mahjongplus/world-calculus';
import type { ZoneRecord } from '@mahjongplus/world-model';

export const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
export const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
export const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
export const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
export const all = (...values: CoreFormula[]): CoreFormula => ({ kind: 'all', values });
export const any = (...values: CoreFormula[]): CoreFormula => ({ kind: 'any', values });
export const not = (value: CoreFormula): CoreFormula => ({ kind: 'not', value });
export const contains = (collection: CoreExpression, value: CoreExpression): CoreFormula => ({ kind: 'contains', collection, value });
export const quantify = (
  quantifier: 'exists' | 'forall',
  source: CoreExpression,
  as: string,
  where: CoreFormula,
): CoreFormula => ({ kind: 'quantify', quantifier, source, as, where });
export const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
export const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
export const aggregate = (
  operator: 'count' | 'sum' | 'min' | 'max',
  source: CoreExpression,
): CoreExpression => ({ kind: 'aggregate', operator, source });
export const arithmetic = (
  operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo',
  left: CoreExpression,
  right: CoreExpression,
): CoreExpression => ({ kind: 'arithmetic', operator, left, right });
export const choose = (
  condition: CoreFormula,
  thenValue: CoreExpression,
  elseValue: CoreExpression,
): CoreExpression => ({ kind: 'if', condition, then: thenValue, else: elseValue });
export const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
export const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
export const concat = (...sources: CoreExpression[]): CoreExpression => ({ kind: 'concat', sources });

export function zone(id: string, kind: string, entityIds: string[] = []): ZoneRecord {
  return {
    id,
    kind,
    ordered: true,
    entries: entityIds.map((entityId, ordinal) => ({
      slotId: `${id}:slot:${ordinal}`,
      entityId,
      ordinal,
      metadata: {},
      state: 'occupied',
    })),
    metadata: {},
  };
}

export function externalConstraint(id: string, formula: CoreFormula): FiniteDomainProgram {
  return { id, variables: [], constraints: [formula], maxSolutions: 1, maxSteps: 100_000 };
}

export function firstMatching(source: CoreExpression, as: string, where: CoreFormula): CoreExpression {
  return path(filter(source, as, where), '0');
}
