import {
  applyRewriteProgram,
  reduceEvents,
  solveFiniteDomain,
  type CoreProgramCollection,
  type EventReducerDefinition,
  type FiniteDomainProgram,
  type FiniteDomainResult,
  type RewriteProgram,
} from '@mahjongplus/world-calculus';
import type { WorldStateSnapshot } from '@mahjongplus/world-model';
import type { RuntimeEvent } from './types.js';

export interface CoreProgramRuntimeSnapshot {
  reducerStates: Record<string, unknown>;
}

export interface CoreWorldDocument {
  world: WorldStateSnapshot;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertWorldDocument(value: unknown): asserts value is CoreWorldDocument {
  if (!value || typeof value !== 'object') throw new Error('Core rewrite must return an object document.');
  const world = (value as Record<string, unknown>).world;
  if (!world || typeof world !== 'object') throw new Error('Core rewrite removed the world snapshot.');
  const record = world as Record<string, unknown>;
  if (!Array.isArray(record.entities) || !Array.isArray(record.zones) || !Array.isArray(record.relations)) {
    throw new Error('Core rewrite produced an invalid world snapshot.');
  }
}

export class CoreProgramRuntime {
  private readonly constraints: Map<string, FiniteDomainProgram>;
  private readonly reducers: Map<string, EventReducerDefinition>;
  private readonly rewrites: Map<string, RewriteProgram>;
  private reducerStates: Record<string, unknown>;

  constructor(programs: CoreProgramCollection | undefined) {
    const normalized: CoreProgramCollection = programs ?? { constraints: [], reducers: [], rewrites: [] };
    this.constraints = new Map(normalized.constraints.map((program) => [program.id, clone(program)]));
    this.reducers = new Map(normalized.reducers.map((program) => [program.id, clone(program)]));
    this.rewrites = new Map(normalized.rewrites.map((program) => [program.id, clone(program)]));
    this.reducerStates = Object.fromEntries(
      [...this.reducers.values()].map((program) => [program.id, clone(program.initialState)]),
    );
  }

  evaluateConstraint(programId: string, variables: Record<string, unknown>): FiniteDomainResult {
    const program = this.constraints.get(programId);
    if (!program) throw new Error(`Unknown core constraint program: ${programId}`);
    return solveFiniteDomain(program, variables);
  }

  recomputeReducers(events: readonly RuntimeEvent[], variables: Record<string, unknown> = {}): void {
    this.reducerStates = Object.fromEntries(
      [...this.reducers.values()].map((program) => [
        program.id,
        reduceEvents(program, events, variables).state,
      ]),
    );
  }

  reducerState<T = unknown>(programId: string): T {
    if (!this.reducers.has(programId)) throw new Error(`Unknown core reducer program: ${programId}`);
    return clone(this.reducerStates[programId] as T);
  }

  allReducerStates(): Record<string, unknown> {
    return clone(this.reducerStates);
  }

  applyRewrite(
    programId: string,
    document: CoreWorldDocument,
    variables: Record<string, unknown>,
  ): CoreWorldDocument {
    const program = this.rewrites.get(programId);
    if (!program) throw new Error(`Unknown core rewrite program: ${programId}`);
    const result = applyRewriteProgram(document, program, variables);
    assertWorldDocument(result);
    return clone(result);
  }

  snapshot(): CoreProgramRuntimeSnapshot {
    return { reducerStates: this.allReducerStates() };
  }

  restore(snapshot: CoreProgramRuntimeSnapshot): void {
    this.reducerStates = clone(snapshot.reducerStates);
  }
}
