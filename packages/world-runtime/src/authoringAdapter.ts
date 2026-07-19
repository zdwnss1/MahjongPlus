import {
  evaluateFormula,
  type CoreFormula,
} from '@mahjongplus/world-calculus';
import {
  compileWorld,
  type ActionDefinition,
  type EffectDefinition,
  type MahjongLanguageRuntimeAdapter,
  type RequirementDefinition,
  type WorldImage,
  type WorldSource,
} from '@mahjongplus/world-language';
import type { WorldActionAttempt, WorldActionReceipt } from './types.js';
import { WorldRuntime } from './runtime.js';

const clone = <T>(value: T): T => structuredClone(value);

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function positiveInteger(value: unknown, fallback: number, maximum: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

function isWorldImage(value: WorldSource | WorldImage): value is WorldImage {
  return typeof (value as { hash?: unknown }).hash === 'string';
}

function imageFrom(value: unknown): WorldImage {
  const source = asRecord(value, 'world') as unknown as WorldSource | WorldImage;
  return isWorldImage(source) ? clone(source) : compileWorld(source);
}

function normalizeAttempt(
  value: unknown,
  runtime: WorldRuntime,
  fallbackId: string,
): WorldActionAttempt {
  const input = asRecord(value, 'attempt');
  const observed = input.observedRevision;
  const observedRevision = observed === undefined || observed === 'current'
    ? runtime.currentRevision
    : observed;
  if (typeof observedRevision !== 'number' || !Number.isInteger(observedRevision) || observedRevision < 0) {
    throw new Error('attempt.observedRevision must be a non-negative integer, "current", or omitted.');
  }
  return {
    attemptId: typeof input.attemptId === 'string' && input.attemptId.length > 0 ? input.attemptId : fallbackId,
    actorId: requireString(input.actorId, 'attempt.actorId'),
    actionId: requireString(input.actionId, 'attempt.actionId'),
    observedRevision,
    parameters: input.parameters === undefined ? {} : asRecord(input.parameters, 'attempt.parameters'),
  };
}

function runtimeSnapshot(runtime: WorldRuntime) {
  return {
    revision: runtime.currentRevision,
    world: runtime.store.snapshot(),
    scheduler: runtime.scheduler.all(),
    events: runtime.journal.all(),
    responseWindows: runtime.windows.snapshot().windows,
    reducers: runtime.core.allReducerStates(),
  };
}

export interface MahjongSimulationStep {
  attempt: WorldActionAttempt;
  receipt: WorldActionReceipt;
  eventIds: string[];
}

export interface MahjongSimulationResult {
  imageHash: string;
  steps: MahjongSimulationStep[];
  final: ReturnType<typeof runtimeSnapshot>;
}

export function simulateMahjongWorld(input: Record<string, unknown>): MahjongSimulationResult {
  const image = imageFrom(input.world);
  const attempts = asArray(input.attempts ?? [], 'attempts');
  const runtime = new WorldRuntime(image);
  if (input.start !== false) runtime.start();
  const steps = attempts.map((entry, index) => {
    const attempt = normalizeAttempt(entry, runtime, `simulation:${index + 1}`);
    const receipt = runtime.attempt(attempt);
    return { attempt, receipt, eventIds: [...receipt.eventIds] };
  });
  return { imageHash: image.hash, steps, final: runtimeSnapshot(runtime) };
}

function expressionRootPath(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind === 'variable' && typeof record.name === 'string') return record.name;
  if (record.kind === 'path' && Array.isArray(record.path)) {
    const root = expressionRootPath(record.target);
    if (!root) return undefined;
    return [root, ...record.path.map(String)].join('.');
  }
  return undefined;
}

function collectProgramReads(value: unknown, paths = new Set<string>(), variables = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectProgramReads(entry, paths, variables);
    return { paths, variables };
  }
  if (!value || typeof value !== 'object') return { paths, variables };
  const record = value as Record<string, unknown>;
  if (record.kind === 'variable' && typeof record.name === 'string') variables.add(record.name);
  if (record.kind === 'path') {
    const formatted = expressionRootPath(record);
    if (formatted) paths.add(formatted);
  }
  for (const entry of Object.values(record)) collectProgramReads(entry, paths, variables);
  return { paths, variables };
}

function effectReferences(effects: EffectDefinition[]) {
  const rewrites = new Set<string>();
  const events = new Set<string>();
  const responseWindows = new Set<string>();
  const procedures = new Set<string>();
  for (const effect of effects) {
    if (effect.kind === 'core.rewrite') rewrites.add(effect.programId);
    if (effect.kind === 'event.emit') events.add(effect.eventType);
    if (effect.kind === 'response-window.open') responseWindows.add(effect.definitionId);
    if (effect.kind.startsWith('procedure.')) {
      if ('procedureId' in effect && typeof effect.procedureId === 'string') procedures.add(effect.procedureId);
    }
  }
  return {
    rewrites: [...rewrites].sort(),
    events: [...events].sort(),
    responseWindows: [...responseWindows].sort(),
    procedures: [...procedures].sort(),
  };
}

function actionDependencies(action: ActionDefinition) {
  return {
    id: action.id,
    constraintPrograms: action.requirements
      .filter((entry): entry is Extract<RequirementDefinition, { kind: 'core.constraint' }> => entry.kind === 'core.constraint')
      .map((entry) => entry.programId),
    requirementKinds: [...new Set(action.requirements.map((entry) => entry.kind))].sort(),
    ...effectReferences(action.effects),
  };
}

function coreProgramDependencies(image: WorldImage) {
  return {
    constraints: (image.corePrograms?.constraints ?? []).map((program) => {
      const reads = collectProgramReads(program);
      return { id: program.id, reads: [...reads.paths].sort(), variables: [...reads.variables].sort() };
    }),
    reducers: (image.corePrograms?.reducers ?? []).map((program) => {
      const reads = collectProgramReads(program.transitions);
      return {
        id: program.id,
        reads: [...reads.paths].sort(),
        variables: [...reads.variables].sort(),
        writes: [...new Set(program.transitions.flatMap((transition) => transition.updates.map((update) => update.path.join('.'))))].sort(),
      };
    }),
    rewrites: (image.corePrograms?.rewrites ?? []).map((program) => {
      const reads = collectProgramReads(program.operations);
      return {
        id: program.id,
        reads: [...reads.paths].sort(),
        variables: [...reads.variables].sort(),
        writes: program.operations.map((operation) => operation.path.join('.')),
      };
    }),
  };
}

export function inspectMahjongDependencies(input: Record<string, unknown>) {
  const image = imageFrom(input.world);
  const moduleId = typeof input.moduleId === 'string' ? input.moduleId : undefined;
  const manifests = ((image.metadata?.ruleModules as Array<Record<string, unknown>> | undefined) ?? [])
    .filter((manifest) => !moduleId || manifest.id === moduleId);
  return {
    imageHash: image.hash,
    modules: clone(manifests),
    actions: image.actions.map(actionDependencies),
    responseWindows: (image.responseWindows ?? []).map((window) => ({
      id: window.id,
      allowedActionIds: [...window.allowedActionIds],
      participantOrder: [...window.participantOrder],
      noSelection: effectReferences(window.noSelectionEffects),
      selections: Object.fromEntries(Object.entries(window.selectionEffects)
        .map(([actionId, effects]) => [actionId, effectReferences(effects)])),
    })),
    procedures: image.procedures.map((procedure) => ({
      id: procedure.id,
      nodes: procedure.nodes.map((node) => ({ id: node.id, onEnter: effectReferences(node.onEnter ?? []) })),
    })),
    corePrograms: coreProgramDependencies(image),
  };
}

function mapById<T extends { id: string }>(values: readonly T[]): Map<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

function compareById<T extends { id: string }>(before: readonly T[], after: readonly T[]) {
  const left = mapById(before);
  const right = mapById(after);
  const added = [...right.keys()].filter((id) => !left.has(id)).sort();
  const removed = [...left.keys()].filter((id) => !right.has(id)).sort();
  const changed = [...right.keys()].filter((id) => left.has(id)
    && JSON.stringify(left.get(id)) !== JSON.stringify(right.get(id))).sort();
  return { added, removed, changed };
}

function zoneLayout(image: WorldImage) {
  return Object.fromEntries(image.zones.map((zone) => [
    zone.id,
    zone.entries.map((entry) => ({ entityId: entry.entityId, state: entry.state, ordinal: entry.ordinal })),
  ]));
}

export function diffMahjongWorlds(input: Record<string, unknown>) {
  const before = imageFrom(input.before);
  const after = imageFrom(input.after);
  return {
    beforeHash: before.hash,
    afterHash: after.hash,
    changed: before.hash !== after.hash,
    entities: compareById(before.entities, after.entities),
    zones: compareById(before.zones, after.zones),
    relations: compareById(before.relations, after.relations),
    actions: compareById(before.actions, after.actions),
    procedures: compareById(before.procedures, after.procedures),
    responseWindows: compareById(before.responseWindows ?? [], after.responseWindows ?? []),
    corePrograms: {
      constraints: compareById(before.corePrograms?.constraints ?? [], after.corePrograms?.constraints ?? []),
      reducers: compareById(before.corePrograms?.reducers ?? [], after.corePrograms?.reducers ?? []),
      rewrites: compareById(before.corePrograms?.rewrites ?? [], after.corePrograms?.rewrites ?? []),
    },
    physicalLayouts: {
      before: zoneLayout(before),
      after: zoneLayout(after),
    },
    modules: {
      before: clone((before.metadata?.ruleModules as unknown[] | undefined) ?? []),
      after: clone((after.metadata?.ruleModules as unknown[] | undefined) ?? []),
    },
  };
}

function findProgram(image: WorldImage, id: string) {
  const candidates = [
    ...(image.corePrograms?.constraints ?? []).map((program) => ({ kind: 'constraint', program })),
    ...(image.corePrograms?.reducers ?? []).map((program) => ({ kind: 'reducer', program })),
    ...(image.corePrograms?.rewrites ?? []).map((program) => ({ kind: 'rewrite', program })),
  ];
  return candidates.find((entry) => entry.program.id === id);
}

export function explainMahjongWorld(input: Record<string, unknown>) {
  const image = imageFrom(input.world);
  const subject = asRecord(input.subject, 'subject');
  const kind = requireString(subject.kind, 'subject.kind');
  if (kind === 'attempt') {
    const attempts = asArray(subject.attempts ?? [], 'subject.attempts');
    const simulation = simulateMahjongWorld({ world: image, attempts });
    const attemptId = typeof subject.attemptId === 'string' ? subject.attemptId : undefined;
    const step = attemptId
      ? simulation.steps.find((entry) => entry.attempt.attemptId === attemptId)
      : simulation.steps.at(-1);
    if (!step) throw new Error('No matching simulated attempt was found.');
    const action = image.actions.find((entry) => entry.id === step.attempt.actionId);
    const requirements = Object.fromEntries((action?.requirements ?? []).map((entry) => [entry.id, entry]));
    return {
      attempt: step.attempt,
      receipt: step.receipt,
      failedRequirements: step.receipt.failures.map((failure) => ({
        ...failure,
        definition: requirements[failure.id],
      })),
      events: simulation.final.events.filter((event) => step.receipt.eventIds.includes(event.id)),
    };
  }
  if (kind === 'program') {
    const id = requireString(subject.id, 'subject.id');
    const entry = findProgram(image, id);
    if (!entry) throw new Error(`Unknown core program ${id}.`);
    const dependencies = inspectMahjongDependencies({ world: image });
    const collection = (dependencies.corePrograms as Record<string, Array<Record<string, unknown>>>)[`${entry.kind}s`];
    return {
      kind: entry.kind,
      program: clone(entry.program),
      dependencies: collection?.find((candidate) => candidate.id === id),
      actionReferences: image.actions.filter((action) =>
        action.requirements.some((requirement) => requirement.kind === 'core.constraint' && requirement.programId === id)
        || action.effects.some((effect) => effect.kind === 'core.rewrite' && effect.programId === id))
        .map((action) => action.id),
    };
  }
  if (kind === 'entity') {
    const id = requireString(subject.id, 'subject.id');
    const entity = image.entities.find((entry) => entry.id === id);
    if (!entity) throw new Error(`Unknown entity ${id}.`);
    return {
      entity: clone(entity),
      placements: image.zones.flatMap((zone) => zone.entries
        .filter((entry) => entry.entityId === id)
        .map((entry) => ({ zoneId: zone.id, ...entry }))),
      relations: image.relations.filter((relation) => relation.source.id === id || relation.target.id === id),
    };
  }
  if (kind === 'module') {
    const id = requireString(subject.id, 'subject.id');
    const manifests = (image.metadata?.ruleModules as Array<Record<string, unknown>> | undefined) ?? [];
    return {
      manifest: clone(manifests.find((entry) => entry.id === id)),
      dependencyView: inspectMahjongDependencies({ world: image, moduleId: id }),
    };
  }
  throw new Error(`Unsupported explanation subject kind ${kind}.`);
}

interface SearchCase {
  actorId: string;
  actionId: string;
  parameters: Record<string, unknown>;
}

function searchCases(bounds: Record<string, unknown>): SearchCase[] {
  const actors = asArray(bounds.actors ?? [], 'bounds.actors').map((entry) => requireString(entry, 'bounds.actors[]'));
  const actions = asArray(bounds.actions ?? [], 'bounds.actions');
  const cases: SearchCase[] = [];
  for (const actionValue of actions) {
    const action = asRecord(actionValue, 'bounds.actions[]');
    const actionId = requireString(action.actionId, 'bounds.actions[].actionId');
    const actionActors = action.actorIds === undefined
      ? actors
      : asArray(action.actorIds, 'bounds.actions[].actorIds').map((entry) => requireString(entry, 'actorId'));
    if (actionActors.length === 0) throw new Error(`No actors were supplied for action ${actionId}.`);
    const parameters = action.parameterCases === undefined
      ? [{}]
      : asArray(action.parameterCases, 'bounds.actions[].parameterCases')
        .map((entry) => asRecord(entry, 'parameter case'));
    for (const actorId of actionActors) {
      for (const parameterCase of parameters) cases.push({ actorId, actionId, parameters: clone(parameterCase) });
    }
  }
  if (cases.length === 0) throw new Error('Counterexample bounds produced no action cases.');
  return cases;
}

function invariantVariables(result: MahjongSimulationResult, trace: unknown[]) {
  return {
    world: result.final.world,
    events: result.final.events,
    reducers: result.final.reducers,
    receipts: result.steps.map((step) => step.receipt),
    revision: result.final.revision,
    scheduler: result.final.scheduler,
    windows: result.final.responseWindows,
    trace,
  };
}

export function findMahjongCounterexample(input: Record<string, unknown>) {
  const image = imageFrom(input.world);
  const invariantInput = asRecord(input.invariant, 'invariant');
  const formula = (invariantInput.formula ?? input.invariant) as CoreFormula;
  if (!formula || typeof formula !== 'object' || typeof (formula as { kind?: unknown }).kind !== 'string') {
    throw new Error('invariant must be a CoreFormula or contain a formula field.');
  }
  const bounds = input.bounds === undefined ? {} : asRecord(input.bounds, 'bounds');
  const maxDepth = positiveInteger(bounds.maxDepth, 3, 6, 'bounds.maxDepth');
  const maxTraces = positiveInteger(bounds.maxTraces, 1_000, 10_000, 'bounds.maxTraces');
  const cases = searchCases(bounds);
  const queue: SearchCase[][] = [[]];
  let checked = 0;
  while (queue.length > 0 && checked < maxTraces) {
    const trace = queue.shift() as SearchCase[];
    const attempts = trace.map((entry, index) => ({
      attemptId: `counterexample:${index + 1}`,
      actorId: entry.actorId,
      actionId: entry.actionId,
      parameters: entry.parameters,
      observedRevision: 'current',
    }));
    const result = simulateMahjongWorld({ world: image, attempts });
    checked += 1;
    const holds = evaluateFormula(formula, { variables: invariantVariables(result, trace) });
    if (!holds) return { found: true, checked, trace, result };
    if (trace.length < maxDepth) {
      for (const candidate of cases) queue.push([...trace, candidate]);
    }
  }
  return {
    found: false,
    checked,
    exhausted: queue.length === 0,
    truncated: queue.length > 0,
    bounds: { maxDepth, maxTraces, cases: cases.length },
  };
}

export function createDefaultMahjongLanguageRuntimeAdapter(): MahjongLanguageRuntimeAdapter {
  return {
    simulate: simulateMahjongWorld,
    findCounterexample: findMahjongCounterexample,
    explain: explainMahjongWorld,
    dependencies: inspectMahjongDependencies,
    diff: diffMahjongWorlds,
  };
}
