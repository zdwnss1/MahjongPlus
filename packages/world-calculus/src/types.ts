export type CoreScalar = string | number | boolean | null;
export type CoreJson = CoreScalar | CoreJson[] | { [key: string]: CoreJson };

export type ArithmeticOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo';
export type ComparisonOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
export type AggregateOperator = 'count' | 'sum' | 'min' | 'max';

export type CoreExpression =
  | { kind: 'literal'; value: unknown }
  | { kind: 'variable'; name: string }
  | { kind: 'path'; target: CoreExpression; path: string[] }
  | { kind: 'list'; items: CoreExpression[] }
  | { kind: 'record'; fields: Record<string, CoreExpression> }
  | { kind: 'if'; condition: CoreFormula; then: CoreExpression; else: CoreExpression }
  | { kind: 'arithmetic'; operator: ArithmeticOperator; left: CoreExpression; right: CoreExpression }
  | { kind: 'filter'; source: CoreExpression; as: string; where: CoreFormula }
  | { kind: 'map'; source: CoreExpression; as: string; select: CoreExpression }
  | { kind: 'concat'; sources: CoreExpression[] }
  | { kind: 'flatten'; source: CoreExpression }
  | { kind: 'distinct'; source: CoreExpression }
  | { kind: 'aggregate'; operator: AggregateOperator; source: CoreExpression; as?: string; value?: CoreExpression };

export type CoreFormula =
  | { kind: 'boolean'; value: boolean }
  | { kind: 'not'; value: CoreFormula }
  | { kind: 'all'; values: CoreFormula[] }
  | { kind: 'any'; values: CoreFormula[] }
  | { kind: 'compare'; operator: ComparisonOperator; left: CoreExpression; right: CoreExpression }
  | { kind: 'contains'; collection: CoreExpression; value: CoreExpression }
  | { kind: 'quantify'; quantifier: 'exists' | 'forall'; source: CoreExpression; as: string; where: CoreFormula };

export interface CoreEvaluationEnvironment {
  variables: Record<string, unknown>;
}

export interface FiniteVariableDefinition {
  name: string;
  domain: CoreExpression;
}

export interface FiniteDomainProgram {
  id: string;
  variables: FiniteVariableDefinition[];
  constraints: CoreFormula[];
  outputs?: Record<string, CoreExpression>;
  maxSolutions?: number;
  maxSteps?: number;
}

export interface FiniteDomainSolution {
  assignment: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

export interface FiniteDomainResult {
  satisfiable: boolean;
  solutions: FiniteDomainSolution[];
  exploredSteps: number;
}

export interface ReducerUpdate {
  path: string[];
  value: CoreExpression;
}

export interface ReducerTransition {
  when: CoreFormula;
  updates: ReducerUpdate[];
}

export interface EventReducerDefinition {
  id: string;
  initialState: unknown;
  transitions: ReducerTransition[];
}

export interface EventReducerResult {
  state: unknown;
  trace: Array<{ eventIndex: number; state: unknown }>;
}

export type RewriteOperation =
  | { kind: 'set'; path: string[]; value: CoreExpression }
  | { kind: 'delete'; path: string[] }
  | { kind: 'append'; path: string[]; value: CoreExpression }
  | { kind: 'remove-where'; path: string[]; as: string; where: CoreFormula };

export interface RewriteProgram {
  id: string;
  operations: RewriteOperation[];
}

export interface PartitionItemDefinition {
  id: string;
  attributes: Record<string, unknown>;
}

export interface PartitionGroupAlternative {
  id: string;
  size: number;
  predicate: CoreFormula;
}

export interface PartitionGroupSlot {
  id: string;
  count: number;
  alternatives: PartitionGroupAlternative[];
}

export interface PartitionMacroInput {
  id: string;
  items: PartitionItemDefinition[];
  slots: PartitionGroupSlot[];
  memberVariable?: string;
  maxSolutions?: number;
  maxSteps?: number;
}

export interface PartitionMacroExpansion {
  program: FiniteDomainProgram;
  input: PartitionMacroInput;
}

export interface LanguageToolDescriptor {
  name: 'core.evaluate' | 'core.solve' | 'core.reduce' | 'core.rewrite' | 'core.expand';
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface LanguageResourceDescriptor {
  uri: string;
  name: string;
  mimeType: 'application/json';
}
