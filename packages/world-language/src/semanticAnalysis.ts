import type { WorldSource } from './ast.js';
import { compileWorld } from './compiler.js';
import {
  instantiateRuleModule,
  validateRuleModuleDefinition,
  type RuleModuleApplication,
  type RuleModuleDefinition,
} from './ruleModules.js';

export type SemanticDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface SemanticDiagnostic {
  severity: SemanticDiagnosticSeverity;
  code: string;
  message: string;
  moduleId?: string;
  target?: string;
}

export interface ProgramSemanticAnalysis {
  id: string;
  kind: 'constraint' | 'reducer' | 'rewrite';
  reads: string[];
  writes: string[];
  variables: string[];
  eventTypes: string[];
  expressionKinds: string[];
}

export interface ActionSemanticAnalysis {
  id: string;
  parameters: string[];
  requirementKinds: string[];
  effectKinds: string[];
  constraintPrograms: string[];
  rewritePrograms: string[];
  emittedEvents: string[];
  openedWindows: string[];
  procedures: string[];
}

export interface RuleModuleSemanticAnalysis {
  id: string;
  version: string;
  title?: string;
  requiredBindings: string[];
  parameterNames: string[];
  templateOperations: string[];
  templateReferences: string[];
  provides: {
    entities: string[];
    zones: string[];
    relations: string[];
    actions: string[];
    procedures: string[];
    responseWindows: string[];
    constraints: string[];
    reducers: string[];
    rewrites: string[];
    artifacts: string[];
    events: string[];
  };
  consumes: {
    patchedActions: string[];
    patchedWindows: string[];
    patchedProcedures: string[];
    bindings: string[];
    programs: string[];
  };
  actions: ActionSemanticAnalysis[];
  programs: ProgramSemanticAnalysis[];
  writePaths: string[];
  metadata: Record<string, unknown>;
}

export interface WorldSemanticAnalysis {
  id: string;
  schemaVersion: string;
  entities: Array<{ id: string; kind: string; components: string[] }>;
  zones: Array<{ id: string; kind: string; size: number; ordered: boolean }>;
  relationTypes: string[];
  actions: ActionSemanticAnalysis[];
  procedures: Array<{ id: string; entryNodeId: string; nodes: string[] }>;
  responseWindows: Array<{
    id: string;
    actions: string[];
    selectedActions: string[];
    participantOrder: string[];
  }>;
  programs: ProgramSemanticAnalysis[];
  initialEvents: string[];
  eventProducers: Record<string, string[]>;
  modules: unknown[];
  hostBoundary?: unknown;
}

export interface ModuleCompositionDiagnosis {
  diagnostics: SemanticDiagnostic[];
  analyses: RuleModuleSemanticAnalysis[];
  world?: WorldSource;
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function staticId(value: unknown): string {
  return typeof value === 'string' ? value : `<dynamic:${JSON.stringify(value)}>`;
}

function renderExpressionPath(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (record.kind === 'variable' && typeof record.name === 'string') return `$${record.name}`;
  if (record.kind !== 'path' || !Array.isArray(record.path)) return undefined;
  const target = renderExpressionPath(record.target) ?? '<dynamic>';
  return [target, ...record.path.map((entry) => staticId(entry))].join('.');
}

interface ScanResult {
  expressionKinds: Set<string>;
  variables: Set<string>;
  reads: Set<string>;
  writes: Set<string>;
  eventTypes: Set<string>;
  moduleOperations: Set<string>;
  moduleReferences: Set<string>;
}

function createScanResult(): ScanResult {
  return {
    expressionKinds: new Set(),
    variables: new Set(),
    reads: new Set(),
    writes: new Set(),
    eventTypes: new Set(),
    moduleOperations: new Set(),
    moduleReferences: new Set(),
  };
}

function scanValue(value: unknown, result: ScanResult): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => scanValue(entry, result));
    return;
  }
  const record = asRecord(value);
  if (!record) return;

  if (typeof record.$module === 'string') {
    result.moduleOperations.add(record.$module);
    if (record.$module === 'ref' && typeof record.path === 'string') result.moduleReferences.add(record.path);
  }
  if (typeof record.kind === 'string') {
    result.expressionKinds.add(record.kind);
    if (record.kind === 'variable' && typeof record.name === 'string') result.variables.add(record.name);
    if (record.kind === 'path') {
      const rendered = renderExpressionPath(record);
      if (rendered) result.reads.add(rendered);
    }
    if (record.kind === 'event.emit' && typeof record.eventType === 'string') result.eventTypes.add(record.eventType);
  }
  if (Array.isArray(record.operations)) {
    for (const operation of record.operations) {
      const operationRecord = asRecord(operation);
      if (operationRecord && Array.isArray(operationRecord.path)) {
        result.writes.add(operationRecord.path.map((entry) => staticId(entry)).join('.'));
      }
    }
  }
  for (const entry of Object.values(record)) scanValue(entry, result);
}

function actionAnalysis(value: unknown): ActionSemanticAnalysis {
  const action = asRecord(value) ?? {};
  const requirements = Array.isArray(action.requirements) ? action.requirements : [];
  const effects = Array.isArray(action.effects) ? action.effects : [];
  const constraintPrograms: string[] = [];
  const rewritePrograms: string[] = [];
  const emittedEvents: string[] = [];
  const openedWindows: string[] = [];
  const procedures: string[] = [];

  for (const requirement of requirements) {
    const record = asRecord(requirement);
    if (record?.kind === 'core.constraint' && typeof record.programId === 'string') constraintPrograms.push(record.programId);
    if (record?.kind === 'procedure-token' && typeof record.procedureId === 'string') procedures.push(record.procedureId);
  }
  for (const effect of effects) {
    const record = asRecord(effect);
    if (!record) continue;
    if (record.kind === 'core.rewrite' && typeof record.programId === 'string') rewritePrograms.push(record.programId);
    if (record.kind === 'event.emit' && typeof record.eventType === 'string') emittedEvents.push(record.eventType);
    if (record.kind === 'response-window.open' && typeof record.definitionId === 'string') openedWindows.push(record.definitionId);
    if ((record.kind === 'procedure.spawn') && typeof record.procedureId === 'string') procedures.push(record.procedureId);
  }
  return {
    id: staticId(action.id),
    parameters: Object.keys(asRecord(action.parameters) ?? {}).sort(),
    requirementKinds: unique(requirements.map((entry) => String(asRecord(entry)?.kind ?? '<unknown>'))),
    effectKinds: unique(effects.map((entry) => String(asRecord(entry)?.kind ?? '<unknown>'))),
    constraintPrograms: unique(constraintPrograms),
    rewritePrograms: unique(rewritePrograms),
    emittedEvents: unique(emittedEvents),
    openedWindows: unique(openedWindows),
    procedures: unique(procedures),
  };
}

function programAnalysis(value: unknown, kind: ProgramSemanticAnalysis['kind']): ProgramSemanticAnalysis {
  const record = asRecord(value) ?? {};
  const scan = createScanResult();
  scanValue(value, scan);
  return {
    id: staticId(record.id),
    kind,
    reads: unique(scan.reads),
    writes: unique(scan.writes),
    variables: unique(scan.variables),
    eventTypes: unique(scan.eventTypes),
    expressionKinds: unique(scan.expressionKinds),
  };
}

function addedIds(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((entry) => staticId(asRecord(entry)?.id))
    : [];
}

function coreProgramValues(core: unknown, key: string): unknown[] {
  const value = asRecord(core)?.[key];
  return Array.isArray(value) ? value : [];
}

export function analyzeRuleModuleDefinition(definition: RuleModuleDefinition): RuleModuleSemanticAnalysis {
  const scan = createScanResult();
  scanValue(definition, scan);
  const additions = asRecord(definition.additions) ?? {};
  const core = additions.corePrograms;
  const constraints = coreProgramValues(core, 'constraints');
  const reducers = coreProgramValues(core, 'reducers');
  const rewrites = coreProgramValues(core, 'rewrites');
  const actions = Array.isArray(additions.actions) ? additions.actions.map(actionAnalysis) : [];
  const patches = Array.isArray(definition.patches) ? definition.patches : [];
  const patchedActions: string[] = [];
  const patchedWindows: string[] = [];
  const patchedProcedures: string[] = [];
  for (const patch of patches) {
    const record = asRecord(patch);
    if (!record) continue;
    if (record.kind === 'action.effects' || record.kind === 'action.requirements') patchedActions.push(staticId(record.actionId));
    if (record.kind === 'response.selection-effects' || record.kind === 'response.no-selection-effects') {
      patchedWindows.push(staticId(record.windowId));
    }
    if (record.kind === 'procedure.node-effects') patchedProcedures.push(`${staticId(record.procedureId)}/${staticId(record.nodeId)}`);
  }
  const programs = [
    ...constraints.map((entry) => programAnalysis(entry, 'constraint')),
    ...reducers.map((entry) => programAnalysis(entry, 'reducer')),
    ...rewrites.map((entry) => programAnalysis(entry, 'rewrite')),
  ];
  const providedEvents = new Set(actions.flatMap((entry) => entry.emittedEvents));
  const windows = Array.isArray(additions.responseWindows) ? additions.responseWindows : [];
  for (const window of windows) {
    const record = asRecord(window);
    if (!record) continue;
    scanValue(record.selectionEffects, scan);
    scanValue(record.noSelectionEffects, scan);
  }
  scan.eventTypes.forEach((entry) => providedEvents.add(entry));
  const consumedPrograms = unique(actions.flatMap((entry) => [...entry.constraintPrograms, ...entry.rewritePrograms]));

  return {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    requiredBindings: [...(definition.requiredBindings ?? [])].sort(),
    parameterNames: Object.keys(asRecord(definition.parameters?.schema)?.properties as Record<string, unknown> ?? {}).sort(),
    templateOperations: unique(scan.moduleOperations),
    templateReferences: unique(scan.moduleReferences),
    provides: {
      entities: addedIds(additions.entities),
      zones: addedIds(additions.zones),
      relations: addedIds(additions.relations),
      actions: actions.map((entry) => entry.id).sort(),
      procedures: addedIds(additions.procedures),
      responseWindows: addedIds(additions.responseWindows),
      constraints: constraints.map((entry) => staticId(asRecord(entry)?.id)),
      reducers: reducers.map((entry) => staticId(asRecord(entry)?.id)),
      rewrites: rewrites.map((entry) => staticId(asRecord(entry)?.id)),
      artifacts: Object.keys(definition.artifacts ?? {}).sort(),
      events: [...providedEvents].sort(),
    },
    consumes: {
      patchedActions: unique(patchedActions),
      patchedWindows: unique(patchedWindows),
      patchedProcedures: unique(patchedProcedures),
      bindings: [...(definition.requiredBindings ?? [])].sort(),
      programs: consumedPrograms,
    },
    actions,
    programs,
    writePaths: unique(programs.flatMap((entry) => entry.writes)),
    metadata: structuredClone(definition.metadata ?? {}),
  };
}

function allWorldEffects(world: WorldSource): Array<{ owner: string; effect: unknown }> {
  const values: Array<{ owner: string; effect: unknown }> = [];
  for (const action of world.actions) action.effects.forEach((effect) => values.push({ owner: `action:${action.id}`, effect }));
  for (const procedure of world.procedures) {
    for (const node of procedure.nodes) (node.onEnter ?? []).forEach((effect) => values.push({ owner: `procedure:${procedure.id}/${node.id}`, effect }));
  }
  for (const window of world.responseWindows ?? []) {
    (window.noSelectionEffects ?? []).forEach((effect) => values.push({ owner: `window:${window.id}/none`, effect }));
    for (const [actionId, effects] of Object.entries(window.selectionEffects)) {
      effects.forEach((effect) => values.push({ owner: `window:${window.id}/${actionId}`, effect }));
    }
  }
  return values;
}

export function analyzeWorldSource(world: WorldSource): WorldSemanticAnalysis {
  const constraints = world.corePrograms?.constraints ?? [];
  const reducers = world.corePrograms?.reducers ?? [];
  const rewrites = world.corePrograms?.rewrites ?? [];
  const eventProducers = new Map<string, Set<string>>();
  for (const { owner, effect } of allWorldEffects(world)) {
    const record = asRecord(effect);
    if (record?.kind !== 'event.emit' || typeof record.eventType !== 'string') continue;
    const owners = eventProducers.get(record.eventType) ?? new Set<string>();
    owners.add(owner);
    eventProducers.set(record.eventType, owners);
  }
  return {
    id: world.id,
    schemaVersion: world.schemaVersion,
    entities: world.entities.map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      components: Object.keys(entity.components).sort(),
    })),
    zones: world.zones.map((zone) => ({ id: zone.id, kind: zone.kind, size: zone.entries.length, ordered: zone.ordered })),
    relationTypes: unique(world.relations.map((relation) => relation.type)),
    actions: world.actions.map(actionAnalysis),
    procedures: world.procedures.map((procedure) => ({
      id: procedure.id,
      entryNodeId: procedure.entryNodeId,
      nodes: procedure.nodes.map((node) => node.id),
    })),
    responseWindows: (world.responseWindows ?? []).map((window) => ({
      id: window.id,
      actions: [...window.allowedActionIds],
      selectedActions: Object.keys(window.selectionEffects).sort(),
      participantOrder: [...window.participantOrder],
    })),
    programs: [
      ...constraints.map((entry) => programAnalysis(entry, 'constraint')),
      ...reducers.map((entry) => programAnalysis(entry, 'reducer')),
      ...rewrites.map((entry) => programAnalysis(entry, 'rewrite')),
    ],
    initialEvents: unique((world.initialEvents ?? []).map((event) => event.type)),
    eventProducers: Object.fromEntries([...eventProducers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([type, owners]) => [type, [...owners].sort()])),
    modules: structuredClone((world.metadata?.ruleModules as unknown[] | undefined) ?? []),
    hostBoundary: structuredClone(world.metadata?.hostBoundary),
  };
}

function duplicateDiagnostics(values: string[], kind: string): SemanticDiagnostic[] {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => ({ severity: 'error', code: `duplicate-${kind}`, message: `Duplicate ${kind} id ${value}.`, target: value }));
}

export function diagnoseWorldSemantics(world: WorldSource): SemanticDiagnostic[] {
  const diagnostics: SemanticDiagnostic[] = [
    ...duplicateDiagnostics(world.entities.map((entry) => entry.id), 'entity'),
    ...duplicateDiagnostics(world.zones.map((entry) => entry.id), 'zone'),
    ...duplicateDiagnostics(world.actions.map((entry) => entry.id), 'action'),
    ...duplicateDiagnostics(world.procedures.map((entry) => entry.id), 'procedure'),
    ...duplicateDiagnostics((world.responseWindows ?? []).map((entry) => entry.id), 'response-window'),
  ];
  const constraintIds = new Set((world.corePrograms?.constraints ?? []).map((entry) => entry.id));
  const rewriteIds = new Set((world.corePrograms?.rewrites ?? []).map((entry) => entry.id));
  const actionIds = new Set(world.actions.map((entry) => entry.id));
  const windowIds = new Set((world.responseWindows ?? []).map((entry) => entry.id));
  const procedureIds = new Set(world.procedures.map((entry) => entry.id));

  for (const action of world.actions) {
    for (const requirement of action.requirements) {
      if (requirement.kind === 'core.constraint' && !constraintIds.has(requirement.programId)) {
        diagnostics.push({ severity: 'error', code: 'unknown-constraint', message: `Action ${action.id} references unknown constraint ${requirement.programId}.`, target: action.id });
      }
      if (requirement.kind === 'procedure-token' && !procedureIds.has(requirement.procedureId)) {
        diagnostics.push({ severity: 'error', code: 'unknown-procedure', message: `Action ${action.id} references unknown procedure ${requirement.procedureId}.`, target: action.id });
      }
    }
    for (const effect of action.effects) {
      if (effect.kind === 'core.rewrite' && !rewriteIds.has(effect.programId)) {
        diagnostics.push({ severity: 'error', code: 'unknown-rewrite', message: `Action ${action.id} references unknown rewrite ${effect.programId}.`, target: action.id });
      }
      if (effect.kind === 'response-window.open' && !windowIds.has(effect.definitionId)) {
        diagnostics.push({ severity: 'error', code: 'unknown-response-window', message: `Action ${action.id} opens unknown response window ${effect.definitionId}.`, target: action.id });
      }
      if (effect.kind === 'procedure.spawn' && !procedureIds.has(effect.procedureId)) {
        diagnostics.push({ severity: 'error', code: 'unknown-procedure', message: `Action ${action.id} spawns unknown procedure ${effect.procedureId}.`, target: action.id });
      }
    }
  }
  for (const window of world.responseWindows ?? []) {
    for (const actionId of window.allowedActionIds) {
      if (!actionIds.has(actionId)) diagnostics.push({ severity: 'error', code: 'unknown-window-action', message: `Response window ${window.id} allows unknown action ${actionId}.`, target: window.id });
    }
  }
  const writeOwners = new Map<string, string[]>();
  for (const program of analyzeWorldSource(world).programs.filter((entry) => entry.kind === 'rewrite')) {
    for (const path of program.writes) {
      const owners = writeOwners.get(path) ?? [];
      owners.push(program.id);
      writeOwners.set(path, owners);
    }
  }
  for (const [path, owners] of writeOwners) {
    if (owners.length > 1) diagnostics.push({
      severity: 'warning',
      code: 'overlapping-write-path',
      message: `Multiple rewrites may write ${path}: ${owners.join(', ')}. Ordering must be intentional.`,
      target: path,
    });
  }
  return diagnostics;
}

export function diagnoseModuleComposition(
  base: WorldSource,
  applications: RuleModuleApplication[],
): ModuleCompositionDiagnosis {
  const diagnostics: SemanticDiagnostic[] = [];
  const analyses = applications.map((application) => analyzeRuleModuleDefinition(application.definition));
  let world = structuredClone(base);

  for (const application of applications) {
    const definitionErrors = validateRuleModuleDefinition(application.definition);
    definitionErrors.forEach((message) => diagnostics.push({
      severity: 'error',
      code: 'invalid-module',
      message,
      moduleId: application.definition.id,
    }));
    const bindings = application.bindings ?? {};
    for (const binding of application.definition.requiredBindings ?? []) {
      if (!(binding in bindings)) diagnostics.push({
        severity: 'error',
        code: 'missing-binding',
        message: `Module ${application.definition.id} requires binding ${binding}.`,
        moduleId: application.definition.id,
        target: binding,
      });
    }
    if (definitionErrors.length > 0) continue;
    try {
      world = instantiateRuleModule(world, application).world;
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        code: 'module-instantiation-failed',
        message: error instanceof Error ? error.message : 'Module instantiation failed.',
        moduleId: application.definition.id,
      });
      break;
    }
  }

  if (!diagnostics.some((entry) => entry.severity === 'error')) {
    diagnostics.push(...diagnoseWorldSemantics(world));
    try {
      compileWorld(world);
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        code: 'world-compilation-failed',
        message: error instanceof Error ? error.message : 'World compilation failed.',
      });
    }
  }
  return { diagnostics, analyses, world };
}
