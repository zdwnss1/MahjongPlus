import type {
  CoreExpression,
  CoreFormula,
  EventReducerDefinition,
  RewriteProgram,
} from '@mahjongplus/world-calculus';
import type { RuleModuleDefinition } from './ruleModules.js';
import {
  compileResponsePartitionInterpretationModule,
  type PartitionInterpretationProfile,
  type PartitionInterpretationRegistryDefinition,
} from './partitionInterpretation.js';

export interface TrackedSourcePartitionInterpretationDefinition {
  id: string;
  version: string;
  title?: string;
  profiles: PartitionInterpretationProfile[];
  actionId?: string;
  trackId?: string;
  eventType?: string;
  sourceDefinitionId?: string;
  sourceEntityKind?: string;
  sourceMode?: string;
  /** Event type used to update the current source for a subject. */
  movementEventType?: string;
  /** Component payload field containing the origin zone id. */
  movementFromZonePayloadPath?: string[];
  /** Event subject path containing the moved entity id. */
  movementEntityPath?: string[];
}

const mref = (path: string) => ({ $module: 'ref', path });
const mmap = (source: unknown, as: string, value: unknown) => ({ $module: 'map', source, as, value });
const mtemplate = (value: string) => ({ $module: 'template', value });
const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const choose = (condition: CoreFormula, thenValue: CoreExpression, elseValue: CoreExpression): CoreExpression => ({
  kind: 'if', condition, then: thenValue, else: elseValue,
});
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (...values: CoreFormula[]): CoreFormula => ({ kind: 'all', values });
const contains = (collection: CoreExpression, value: CoreExpression): CoreFormula => ({ kind: 'contains', collection, value });
const aggregate = (operator: 'count' | 'sum' | 'min' | 'max', source: CoreExpression): CoreExpression => ({ kind: 'aggregate', operator, source });

function replaceGeneratedLiterals(value: unknown, replacements: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((entry) => replaceGeneratedLiterals(entry, replacements));
  if (!value || typeof value !== 'object') return value;
  const recordValue = value as Record<string, unknown>;
  if (recordValue.kind === 'literal' && typeof recordValue.value === 'string' && recordValue.value in replacements) {
    return { ...recordValue, value: structuredClone(replacements[recordValue.value]) };
  }
  return Object.fromEntries(Object.entries(recordValue)
    .map(([key, entry]) => [key, replaceGeneratedLiterals(entry, replacements)]));
}

function requireAction(module: RuleModuleDefinition, actionId: string) {
  const actions = module.additions?.actions as Array<Record<string, unknown>> | undefined;
  const action = actions?.find((entry) => entry.id === actionId);
  if (!action) throw new Error(`Generated interpretation action ${actionId} was not found.`);
  return action;
}

export function compileTrackedSourcePartitionInterpretationModule(
  definition: TrackedSourcePartitionInterpretationDefinition,
): RuleModuleDefinition {
  const sourceDefinitionId = definition.sourceDefinitionId ?? `${definition.id}.source`;
  const sourceEntityKind = definition.sourceEntityKind ?? 'interpretation-source';
  const sourceMode = definition.sourceMode ?? 'direct';
  const actionId = definition.actionId ?? `${definition.id}.submit`;
  const trackId = definition.trackId ?? `track:interpretations:${definition.id}`;
  const reducerId = `${definition.id}.latest-source`;
  const sourceRewriteId = `${definition.id}.publish-source`;
  const sourceInZoneConstraintId = `${definition.id}.source-in-subject-zone`;
  const movementEventType = definition.movementEventType ?? 'entity.moved';
  const fromZonePath = definition.movementFromZonePayloadPath ?? ['payload', 'fromZone'];
  const movedEntityPath = definition.movementEntityPath ?? ['subjects', '0', 'id'];

  const baseRegistry: PartitionInterpretationRegistryDefinition = {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    profiles: definition.profiles,
    actionId,
    trackId,
    eventType: definition.eventType ?? 'interpretation.accepted',
    allowedWindowDefinitionIds: [sourceDefinitionId],
  };
  const module = compileResponsePartitionInterpretationModule(baseRegistry);
  module.description = 'Validates partition interpretation proposals against a tracked per-subject physical source entity.';
  module.requiredBindings = [
    ...new Set([
      ...(module.requiredBindings ?? []),
      'playerIds', 'subjectZones', 'sourceZoneIds', 'drawActionId', 'evidenceRelationType',
    ]),
  ];

  const reducers = variable('reducers');
  const events = variable('event');
  const state = variable('state');
  const sourceRecords = path(state, 'sources');
  const sourceReducer: EventReducerDefinition = {
    id: reducerId,
    initialState: {
      sources: mmap(mref('bindings.playerIds'), 'subjectId', {
        subjectId: mref('locals.subjectId'),
        entityId: null,
        exposureId: null,
        sourceActorId: mref('locals.subjectId'),
      }),
    },
    transitions: [{
      when: all(
        compare('eq', path(events, 'type'), literal(movementEventType)),
        contains(literal(mref('bindings.sourceZoneIds')), path(events, ...fromZonePath)),
      ),
      updates: [{
        path: ['sources'],
        value: map(sourceRecords, 'sourceRecord', choose(
          compare('eq', path(variable('sourceRecord'), 'subjectId'), path(events, 'actorId')),
          record({
            subjectId: path(variable('sourceRecord'), 'subjectId'),
            entityId: path(events, ...movedEntityPath),
            exposureId: path(events, 'id'),
            sourceActorId: path(events, 'actorId'),
          }),
          variable('sourceRecord'),
        )),
      }],
    }],
  };

  const world = variable('world');
  const worldEntities = path(world, 'entities');
  const latestSources = path(reducers, reducerId, 'sources');
  const actorSource = path(filter(
    latestSources,
    'trackedSource',
    compare('eq', path(variable('trackedSource'), 'subjectId'), variable('actorId')),
  ), '0');
  const updatedEntities = map(worldEntities, 'entity', choose(
    all(
      compare('eq', path(variable('entity'), 'kind'), literal(sourceEntityKind)),
      compare(
        'eq',
        path(variable('entity'), 'components', 'responseWindow', 'sourceActorId'),
        variable('actorId'),
      ),
    ),
    record({
      id: path(variable('entity'), 'id'),
      kind: path(variable('entity'), 'kind'),
      components: record({
        responseWindow: record({
          id: path(variable('entity'), 'id'),
          definitionId: literal(sourceDefinitionId),
          state: choose(
            compare('neq', path(actorSource, 'entityId'), literal(null)),
            literal('available'),
            literal('unavailable'),
          ),
          participants: list(variable('actorId')),
          sourceActorId: variable('actorId'),
          sourceEventId: path(actorSource, 'exposureId'),
          sourceEntityId: path(actorSource, 'entityId'),
          parentTokenId: literal(null),
          submissions: list(),
          selected: list(),
        }),
      }),
    }),
    variable('entity'),
  ));
  const sourceRewrite: RewriteProgram = {
    id: sourceRewriteId,
    operations: [{ kind: 'set', path: ['world', 'entities'], value: updatedEntities }],
  };

  const params = variable('params');
  const proposal = path(params, 'proposal');
  const subjectPairs = literal(mref('bindings.subjectZones'));
  const subjectPair = path(filter(
    subjectPairs,
    'subjectZone',
    compare('eq', path(variable('subjectZone'), 'subjectId'), variable('actorId')),
  ), '0');
  const subjectZones = filter(
    path(world, 'zones'),
    'candidateZone',
    compare('eq', path(variable('candidateZone'), 'id'), path(subjectPair, 'zoneId')),
  );
  const subjectEntityIds = map(
    path(subjectZones, '0', 'entries'),
    'subjectEntry',
    path(variable('subjectEntry'), 'entityId'),
  );
  const sourceInZoneConstraint = {
    id: sourceInZoneConstraintId,
    variables: [],
    constraints: [all(
      compare('eq', aggregate('count', subjectZones), literal(1)),
      contains(subjectEntityIds, path(proposal, 'sourceEntityId')),
    )],
    maxSolutions: 1,
    maxSteps: 50_000,
  };

  module.additions ??= {};
  module.additions.entities = [
    ...((module.additions.entities ?? []) as unknown[]),
    mmap(mref('bindings.playerIds'), 'subjectId', {
      id: mtemplate(`${definition.id}:source:\${locals.subjectId}`),
      kind: sourceEntityKind,
      components: {
        responseWindow: {
          id: mtemplate(`${definition.id}:source:\${locals.subjectId}`),
          definitionId: sourceDefinitionId,
          state: 'unavailable',
          participants: [mref('locals.subjectId')],
          sourceActorId: mref('locals.subjectId'),
          sourceEventId: null,
          sourceEntityId: null,
          parentTokenId: null,
          submissions: [],
          selected: [],
        },
      },
    }),
  ];
  module.additions.corePrograms ??= {};
  module.additions.corePrograms.constraints = [
    ...((module.additions.corePrograms.constraints ?? []) as unknown[]),
    sourceInZoneConstraint,
  ];
  module.additions.corePrograms.reducers = [
    ...((module.additions.corePrograms.reducers ?? []) as unknown[]),
    sourceReducer,
  ];
  module.additions.corePrograms.rewrites = [
    ...((module.additions.corePrograms.rewrites ?? []) as unknown[]),
    sourceRewrite,
  ];

  const generatedAction = requireAction(module, actionId);
  const requirements = generatedAction.requirements as unknown[];
  requirements.push({
    id: `${actionId}.source-in-zone`,
    kind: 'core.constraint',
    programId: sourceInZoneConstraintId,
    message: 'The tracked source entity is no longer in the subject zone.',
  });

  module.patches = [
    ...(module.patches ?? []),
    {
      kind: 'action.effects',
      actionId: mref('bindings.drawActionId'),
      placement: 'append',
      values: [{ kind: 'core.rewrite', programId: sourceRewriteId }],
    },
  ];

  const transformed = replaceGeneratedLiterals(module, {
    'response-window': sourceEntityKind,
    open: 'available',
    response: sourceMode,
  }) as RuleModuleDefinition;
  transformed.metadata = {
    ...(transformed.metadata ?? {}),
    service: 'tracked-source-partition-interpretation',
    sourceEntityKind,
    sourceDefinitionId,
    sourceMode,
    sourceReducerId: reducerId,
    sourceRewriteId,
    doesNotOpenResponseWindows: true,
  };
  transformed.artifacts = {
    ...(transformed.artifacts ?? {}),
    sourceEntityKind,
    sourceDefinitionId,
    sourceReducerId: reducerId,
    sourceWindowIds: mmap(mref('bindings.playerIds'), 'subjectId', mtemplate(`${definition.id}:source:\${locals.subjectId}`)),
  };
  return transformed;
}
