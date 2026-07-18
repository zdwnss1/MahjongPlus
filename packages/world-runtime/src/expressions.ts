import type { EntityReferenceExpression, Primitive, ValueExpression } from '@mahjongplus/world-language';
import type { WorldRef } from '@mahjongplus/world-model';
import type { ProcedureToken } from './types.js';

export interface EvaluationContext {
  actorId: string;
  attemptId?: string;
  actionId?: string;
  parameters: Record<string, unknown>;
  token?: ProcedureToken;
  lastMovedEntityId?: string;
  automaticDepth?: number;
}

function readPath(context: EvaluationContext, path: string): unknown {
  const roots: Record<string, unknown> = {
    actorId: context.actorId,
    attemptId: context.attemptId,
    actionId: context.actionId,
    params: context.parameters,
    token: context.token,
    lastMovedEntityId: context.lastMovedEntityId,
  };
  const parts = path.split('.');
  let value: unknown = roots[parts.shift() as string];
  for (const part of parts) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export function evaluateValue(expression: ValueExpression, context: EvaluationContext): unknown {
  if (expression.kind === 'literal') return structuredClone(expression.value);
  if (expression.kind === 'context') return readPath(context, expression.path);
  if (expression.kind === 'last-moved-entity') return context.lastMovedEntityId;
  return expression.template.replace(/\$\{([^}]+)\}/g, (_match, path: string) => String(readPath(context, path) ?? ''));
}

export function evaluateString(expression: ValueExpression, context: EvaluationContext): string {
  const value = evaluateValue(expression, context);
  if (typeof value !== 'string' || value.length === 0) throw new Error('Expression did not resolve to a non-empty string.');
  return value;
}

export function evaluateEntityRef(expression: EntityReferenceExpression, context: EvaluationContext): WorldRef {
  if (expression.kind === 'actor') return { kind: 'player', id: context.actorId };
  if (expression.kind === 'last-moved-entity') {
    if (!context.lastMovedEntityId) throw new Error('No entity has moved in the current effect sequence.');
    return { kind: expression.entityKind ?? 'entity', id: context.lastMovedEntityId };
  }
  return { kind: expression.entityKind, id: evaluateString(expression.id, context) };
}

export function evaluatePayload(
  payload: Record<string, ValueExpression | Primitive> | undefined,
  context: EvaluationContext,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload ?? {}).map(([key, value]) => [
    key,
    value && typeof value === 'object' && 'kind' in value
      ? evaluateValue(value as ValueExpression, context)
      : value,
  ]));
}
