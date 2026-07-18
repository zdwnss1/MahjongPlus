import { evaluateExpression, evaluateFormula } from './evaluator.js';
import type { EventReducerDefinition, EventReducerResult } from './types.js';

function setPath(target: unknown, path: readonly string[], value: unknown): void {
  if (path.length === 0) throw new Error('Reducer update path cannot be empty.');
  let current = target as Record<string, unknown>;
  for (const part of path.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = structuredClone(value);
}

export function reduceEvents(
  definition: EventReducerDefinition,
  events: readonly unknown[],
  variables: Record<string, unknown> = {},
): EventReducerResult {
  let state = structuredClone(definition.initialState);
  const trace: EventReducerResult['trace'] = [];
  events.forEach((event, eventIndex) => {
    for (const transition of definition.transitions) {
      const environment = { variables: { ...variables, state, event, eventIndex } };
      if (!evaluateFormula(transition.when, environment)) continue;
      const evaluated = transition.updates.map((update) => ({
        path: update.path,
        value: evaluateExpression(update.value, environment),
      }));
      const nextState = structuredClone(state);
      for (const update of evaluated) setPath(nextState, update.path, update.value);
      state = nextState;
    }
    trace.push({ eventIndex, state: structuredClone(state) });
  });
  return { state, trace };
}
