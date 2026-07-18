import { evaluateExpression, evaluateFormula, readPath } from './evaluator.js';
import type { RewriteProgram } from './types.js';

function requireParent(root: unknown, path: readonly string[]): { parent: Record<string, unknown> | unknown[]; key: string } {
  if (path.length === 0) throw new Error('Rewrite path cannot be empty.');
  let current = root as Record<string, unknown> | unknown[];
  for (const part of path.slice(0, -1)) {
    const next = Array.isArray(current) ? current[Number(part)] : current[part];
    if (!next || typeof next !== 'object') throw new Error(`Unknown rewrite path ${path.join('.')}.`);
    current = next as Record<string, unknown> | unknown[];
  }
  return { parent: current, key: path[path.length - 1] };
}

export function applyRewriteProgram(
  state: unknown,
  program: RewriteProgram,
  variables: Record<string, unknown> = {},
): unknown {
  const next = structuredClone(state);
  for (const operation of program.operations) {
    const environment = { variables: { ...variables, state: next } };
    if (operation.kind === 'remove-where') {
      const collection = readPath(next, operation.path);
      if (!Array.isArray(collection)) throw new Error('remove-where target must be an array.');
      const retained = collection.filter((entry) => !evaluateFormula(operation.where, {
        variables: { ...environment.variables, [operation.as]: entry },
      }));
      const { parent, key } = requireParent(next, operation.path);
      if (Array.isArray(parent)) parent[Number(key)] = retained;
      else parent[key] = retained;
      continue;
    }
    const { parent, key } = requireParent(next, operation.path);
    if (operation.kind === 'delete') {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
      continue;
    }
    const value = evaluateExpression(operation.value, environment);
    if (operation.kind === 'append') {
      const target = Array.isArray(parent) ? parent[Number(key)] : parent[key];
      if (!Array.isArray(target)) throw new Error('append target must be an array.');
      target.push(structuredClone(value));
      continue;
    }
    if (Array.isArray(parent)) parent[Number(key)] = structuredClone(value);
    else parent[key] = structuredClone(value);
  }
  return next;
}
