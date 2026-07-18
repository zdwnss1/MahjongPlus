import type { EventReducerDefinition, FiniteDomainProgram, RewriteProgram } from './types.js';

function unique(kind: string, values: readonly { id: string }[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.id) throw new Error(`${kind} id is required.`);
    if (seen.has(value.id)) throw new Error(`Duplicate ${kind} id: ${value.id}`);
    seen.add(value.id);
  }
}

export interface CoreProgramBundle {
  constraints?: FiniteDomainProgram[];
  reducers?: EventReducerDefinition[];
  rewrites?: RewriteProgram[];
}

export function validateCorePrograms(bundle: CoreProgramBundle = {}): void {
  const constraints = bundle.constraints ?? [];
  const reducers = bundle.reducers ?? [];
  const rewrites = bundle.rewrites ?? [];
  unique('core constraint program', constraints);
  unique('core reducer', reducers);
  unique('core rewrite', rewrites);

  for (const program of constraints) {
    const variables = new Set<string>();
    for (const variable of program.variables) {
      if (!variable.name) throw new Error(`Constraint program ${program.id} has an unnamed variable.`);
      if (variables.has(variable.name)) {
        throw new Error(`Constraint program ${program.id} repeats variable ${variable.name}.`);
      }
      variables.add(variable.name);
    }
    if (program.maxSolutions != null && (!Number.isInteger(program.maxSolutions) || program.maxSolutions < 1)) {
      throw new Error(`Constraint program ${program.id} has an invalid maxSolutions.`);
    }
    if (program.maxSteps != null && (!Number.isInteger(program.maxSteps) || program.maxSteps < 1)) {
      throw new Error(`Constraint program ${program.id} has an invalid maxSteps.`);
    }
  }

  for (const reducer of reducers) {
    for (const transition of reducer.transitions) {
      for (const update of transition.updates) {
        if (update.path.length === 0) throw new Error(`Reducer ${reducer.id} has an empty update path.`);
      }
    }
  }
  for (const rewrite of rewrites) {
    for (const operation of rewrite.operations) {
      if (operation.path.length === 0) throw new Error(`Rewrite ${rewrite.id} has an empty operation path.`);
    }
  }
}
