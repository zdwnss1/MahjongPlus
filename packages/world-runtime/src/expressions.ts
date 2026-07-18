import type {
  CapabilityCallExpression,
  EntityReferenceExpression,
  Primitive,
  ValueExpression,
} from '@mahjongplus/world-language';
import type { WorldRef } from '@mahjongplus/world-model';
import type { ProcedureToken, RuntimeResponseSubmission, RuntimeResponseWindow } from './types.js';

export interface EvaluationContext {
  actorId: string;
  attemptId?: string;
  actionId?: string;
  actionEntityId?: string;
  parameters: Record<string, unknown>;
  token?: ProcedureToken;
  lastMovedEntityId?: string;
  lastCreatedEntityId?: string;
  lastEventId?: string;
  automaticDepth?: number;
  window?: RuntimeResponseWindow;
  submission?: RuntimeResponseSubmission;
  invokeCapability?: (capabilityId: string, input: unknown, version?: string) => unknown;
}

function readPath(context: EvaluationContext, path: string): unknown {
  const roots: Record<string, unknown> = {
    actorId: context.actorId,
    attemptId: context.attemptId,
    actionId: context.actionId,
    actionEntityId: context.actionEntityId,
    params: context.parameters,
    token: context.token,
    lastMovedEntityId: context.lastMovedEntityId,
    lastCreatedEntityId: context.lastCreatedEntityId,
    lastEventId: context.lastEventId,
    window: context.window,
    submission: context.submission,
  };
  const parts = path.split('.');
  let value: unknown = roots[parts.shift() as string];
  for (const part of parts) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function evaluateCapability(expression: CapabilityCallExpression, context: EvaluationContext): unknown {
  if (!context.invokeCapability) throw new Error(`Capability ${expression.capabilityId} is unavailable in this runtime.`);
  return context.invokeCapability(
    expression.capabilityId,
    evaluateDynamic(expression.input, context),
    expression.version,
  );
}

export function evaluateValue(expression: ValueExpression, context: EvaluationContext): unknown {
  if (expression.kind === 'literal') return structuredClone(expression.value);
  if (expression.kind === 'context') return readPath(context, expression.path);
  if (expression.kind === 'last-moved-entity') return context.lastMovedEntityId;
  if (expression.kind === 'last-created-entity') return context.lastCreatedEntityId;
  if (expression.kind === 'capability-call') return evaluateCapability(expression, context);
  return expression.template.replace(/\$\{([^}]+)\}/g, (_match, path: string) => String(readPath(context, path) ?? ''));
}

export function evaluateString(expression: ValueExpression, context: EvaluationContext): string {
  const value = evaluateValue(expression, context);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Expression did not resolve to a non-empty string.');
  }
  return value;
}

export function evaluateStringArray(expression: ValueExpression, context: EvaluationContext): string[] {
  const value = evaluateValue(expression, context);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error('Expression did not resolve to a string array.');
  }
  return [...value] as string[];
}

export function evaluateEntityRef(expression: EntityReferenceExpression, context: EvaluationContext): WorldRef {
  if (expression.kind === 'actor') return { kind: 'player', id: context.actorId };
  if (expression.kind === 'last-moved-entity') {
    if (!context.lastMovedEntityId) throw new Error('No entity has moved in the current effect sequence.');
    return { kind: expression.entityKind ?? 'entity', id: context.lastMovedEntityId };
  }
  if (expression.kind === 'last-created-entity') {
    if (!context.lastCreatedEntityId) throw new Error('No entity has been created in the current effect sequence.');
    return { kind: expression.entityKind ?? 'entity', id: context.lastCreatedEntityId };
  }
  if (expression.kind === 'window-source-entity') {
    if (!context.window) throw new Error('No response window context is active.');
    return { kind: expression.entityKind ?? 'tile', id: context.window.sourceEntityId };
  }
  if (expression.kind === 'window-source-event') {
    if (!context.window) throw new Error('No response window context is active.');
    return { kind: 'event', id: context.window.sourceEventId };
  }
  return { kind: expression.entityKind, id: evaluateString(expression.id, context) };
}

export function evaluateDynamic(value: unknown, context: EvaluationContext): unknown {
  if (Array.isArray(value)) return value.map((entry) => evaluateDynamic(entry, context));
  if (value && typeof value === 'object') {
    const kind = (value as Record<string, unknown>).kind;
    if (typeof kind === 'string' && [
      'literal',
      'context',
      'template',
      'last-moved-entity',
      'last-created-entity',
      'capability-call',
    ].includes(kind)) {
      return evaluateValue(value as ValueExpression, context);
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, evaluateDynamic(entry, context)]));
  }
  return value;
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
