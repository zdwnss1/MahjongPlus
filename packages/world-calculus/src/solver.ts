import { evaluateExpression, evaluateFormula } from './evaluator.js';
import type {
  CoreEvaluationEnvironment,
  FiniteDomainProgram,
  FiniteDomainResult,
  FiniteDomainSolution,
} from './types.js';

export function solveFiniteDomain(
  program: FiniteDomainProgram,
  environment: CoreEvaluationEnvironment = { variables: {} },
): FiniteDomainResult {
  const maxSolutions = program.maxSolutions ?? 1;
  const maxSteps = program.maxSteps ?? 250_000;
  if (!Number.isInteger(maxSolutions) || maxSolutions < 1) throw new Error('maxSolutions must be positive.');
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('maxSteps must be positive.');

  const domains = program.variables.map((variable) => {
    const value = evaluateExpression(variable.domain, environment);
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`Variable ${variable.name} has an empty or invalid domain.`);
    }
    return { name: variable.name, values: structuredClone(value) as unknown[] };
  });
  const solutions: FiniteDomainSolution[] = [];
  let exploredSteps = 0;

  const visit = (index: number, assignment: Record<string, unknown>) => {
    if (solutions.length >= maxSolutions) return;
    exploredSteps += 1;
    if (exploredSteps > maxSteps) throw new Error('Finite-domain step budget exceeded.');
    if (index === domains.length) {
      const finalEnvironment = { variables: { ...environment.variables, ...assignment } };
      if (!program.constraints.every((constraint) => evaluateFormula(constraint, finalEnvironment))) return;
      const outputs = Object.fromEntries(Object.entries(program.outputs ?? {})
        .map(([name, expression]) => [name, evaluateExpression(expression, finalEnvironment)]));
      solutions.push({ assignment: structuredClone(assignment), outputs });
      return;
    }
    const variable = domains[index];
    for (const value of variable.values) {
      visit(index + 1, { ...assignment, [variable.name]: value });
    }
  };

  visit(0, {});
  return { satisfiable: solutions.length > 0, solutions, exploredSteps };
}
