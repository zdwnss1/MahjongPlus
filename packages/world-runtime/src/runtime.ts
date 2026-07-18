import type { ActionDefinition, EffectDefinition, RequirementDefinition, WorldImage } from '@mahjongplus/world-language';
import { WorldStateStore, type WorldRef } from '@mahjongplus/world-model';
import { CoreProgramRuntime } from './corePrograms.js';
import {
  evaluateDynamic,
  evaluateEntityRef,
  evaluatePayload,
  evaluateString,
  evaluateStringArray,
  evaluateValue,
  type EvaluationContext,
} from './expressions.js';
import { RuntimeJournal } from './journal.js';
import { ProcedureScheduler } from './scheduler.js';
import type {
  RequirementFailure,
  RuntimeResponseSubmission,
  WorldActionAttempt,
  WorldActionReceipt,
} from './types.js';
import { ResponseWindowManager } from './windows.js';

function primitiveEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class WorldRuntime {
  readonly store: WorldStateStore;
  readonly scheduler: ProcedureScheduler;
  readonly journal: RuntimeJournal;
  readonly windows: ResponseWindowManager;
  readonly core: CoreProgramRuntime;
  private readonly actions: Map<string, ActionDefinition>;
  private readonly receipts = new Map<string, WorldActionReceipt>();
  private revision = 0;
  private actionSequence = 0;
  private relationSequence = 0;

  constructor(readonly image: WorldImage) {
    this.store = new WorldStateStore({ entities: image.entities, zones: image.zones, relations: image.relations });
    this.scheduler = new ProcedureScheduler(image.procedures);
    this.core = new CoreProgramRuntime(image.corePrograms);
    this.journal = new RuntimeJournal(this.store, (_event, events) => this.core.recomputeReducers(events));
    this.windows = new ResponseWindowManager(image.responseWindows ?? []);
    this.actions = new Map(image.actions.map((action) => [action.id, action]));
    for (const event of image.initialEvents ?? []) {
      this.journal.append({
        id: event.id,
        type: event.type,
        revision: this.revision,
        subjects: event.subjects ?? [],
        objects: event.objects ?? [],
        payload: event.payload ?? {},
      });
    }
  }

  get currentRevision(): number {
    return this.revision;
  }

  start(): void {
    for (const bootstrap of this.image.bootstrap) {
      const token = this.scheduler.spawn(bootstrap.procedureId, bootstrap.ownerId, undefined, bootstrap.tokenId);
      this.enterNode(token.id, 0);
    }
  }

  openResponseWindows() {
    return this.windows.openWindows();
  }

  coreReducerState<T = unknown>(programId: string): T {
    return this.core.reducerState<T>(programId);
  }

  attempt(attempt: WorldActionAttempt): WorldActionReceipt {
    const existing = this.receipts.get(attempt.attemptId);
    if (existing) return structuredClone(existing);
    const revisionBefore = this.revision;
    if (attempt.observedRevision !== this.revision) {
      return this.recordReceipt({
        attemptId: attempt.attemptId,
        outcome: 'stale',
        revisionBefore,
        revisionAfter: this.revision,
        failures: [{ id: 'action.stale', message: 'World revision has changed.' }],
        eventIds: [],
      });
    }

    const action = this.actions.get(attempt.actionId);
    const attemptEntityId = `action-attempt:${attempt.attemptId}`;
    this.store.createEntity({
      id: attemptEntityId,
      kind: 'action-attempt',
      components: { attempt: structuredClone(attempt) },
    });
    const attemptedEvent = this.journal.append({
      type: 'action.attempted',
      revision: this.revision,
      actorId: attempt.actorId,
      subjects: [{ kind: 'player', id: attempt.actorId }],
      objects: [{ kind: 'action-attempt', id: attemptEntityId }],
      payload: { actionId: attempt.actionId, parameters: structuredClone(attempt.parameters) },
    });

    if (!action) {
      this.revision += 1;
      const failures = [{ id: 'action.unknown', message: `Unknown action ${attempt.actionId}.` }];
      const rejected = this.journal.append({
        type: 'action.rejected',
        revision: this.revision,
        actorId: attempt.actorId,
        subjects: [{ kind: 'action-attempt', id: attemptEntityId }],
        objects: [],
        payload: { failures },
      });
      return this.recordReceipt({
        attemptId: attempt.attemptId,
        outcome: 'invalid',
        revisionBefore,
        revisionAfter: this.revision,
        failures,
        eventIds: [attemptedEvent.id, rejected.id],
      });
    }

    const context: EvaluationContext = {
      actorId: attempt.actorId,
      attemptId: attempt.attemptId,
      actionId: attempt.actionId,
      parameters: attempt.parameters,
    };
    const failures = [
      ...this.validateParameters(action, attempt.parameters),
      ...this.evaluateRequirements(action.requirements, context),
    ];
    if (failures.length > 0) {
      this.revision += 1;
      const rejected = this.journal.append({
        type: 'action.rejected',
        revision: this.revision,
        actorId: attempt.actorId,
        subjects: [{ kind: 'action-attempt', id: attemptEntityId }],
        objects: [],
        payload: { failures: structuredClone(failures) },
      });
      return this.recordReceipt({
        attemptId: attempt.attemptId,
        outcome: 'rejected',
        revisionBefore,
        revisionAfter: this.revision,
        failures,
        eventIds: [attemptedEvent.id, rejected.id],
      });
    }

    const stateCheckpoint = this.store.snapshot();
    const schedulerCheckpoint = this.scheduler.snapshot();
    const journalCheckpoint = this.journal.checkpoint();
    const windowCheckpoint = this.windows.snapshot();
    const coreCheckpoint = this.core.snapshot();
    const actionEntityId = `action:${++this.actionSequence}`;
    const eventIds = [attemptedEvent.id];
    try {
      this.store.createEntity({
        id: actionEntityId,
        kind: 'action',
        components: {
          action: {
            definitionId: action.id,
            actorId: attempt.actorId,
            parameters: structuredClone(attempt.parameters),
          },
        },
      });
      context.actionEntityId = actionEntityId;
      this.connect('derived-from', { kind: 'action', id: actionEntityId }, { kind: 'action-attempt', id: attemptEntityId });
      this.connect('performed-by', { kind: 'action', id: actionEntityId }, { kind: 'player', id: attempt.actorId });
      for (const effect of action.effects) {
        eventIds.push(...this.executeEffect(effect, context, actionEntityId, attemptEntityId));
      }
      this.revision += 1;
      const committed = this.journal.append({
        type: 'action.committed',
        revision: this.revision,
        actorId: attempt.actorId,
        subjects: [{ kind: 'action', id: actionEntityId }],
        objects: [],
        causedByActionId: actionEntityId,
        payload: { definitionId: action.id },
      });
      eventIds.push(committed.id);
      return this.recordReceipt({
        attemptId: attempt.attemptId,
        outcome: 'executed',
        revisionBefore,
        revisionAfter: this.revision,
        failures: [],
        eventIds,
      });
    } catch (error) {
      this.store.restore(stateCheckpoint);
      this.scheduler.restore(schedulerCheckpoint);
      this.journal.truncate(journalCheckpoint);
      this.windows.restore(windowCheckpoint);
      this.core.restore(coreCheckpoint);
      this.revision += 1;
      return this.recordReceipt({
        attemptId: attempt.attemptId,
        outcome: 'invalid',
        revisionBefore,
        revisionAfter: this.revision,
        failures: [{ id: 'action.effect-failed', message: error instanceof Error ? error.message : 'Effect failed.' }],
        eventIds: [attemptedEvent.id],
      });
    }
  }

  private validateParameters(action: ActionDefinition, parameters: Record<string, unknown>): RequirementFailure[] {
    const failures: RequirementFailure[] = [];
    for (const [name, expected] of Object.entries(action.parameters)) {
      const value = parameters[name];
      if (value === undefined) continue;
      if (expected === 'string[]') {
        if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
          failures.push({ id: `parameter.${name}.type`, message: `Parameter ${name} must be string[].` });
        }
      } else if (typeof value !== expected) {
        failures.push({ id: `parameter.${name}.type`, message: `Parameter ${name} must be ${expected}.` });
      }
    }
    return failures;
  }

  private evaluateRequirements(
    requirements: RequirementDefinition[],
    context: EvaluationContext,
  ): RequirementFailure[] {
    const failures: RequirementFailure[] = [];
    for (const requirement of requirements) {
      if (requirement.kind === 'procedure-token') {
        const ownerId = requirement.owner === 'actor'
          ? context.actorId
          : evaluateString(requirement.owner.value, context);
        const token = this.scheduler.find(requirement.procedureId, requirement.nodeId, ownerId);
        if (!token) failures.push({ id: requirement.id, message: requirement.message });
        else context.token = token;
        continue;
      }
      if (requirement.kind === 'zone-not-empty') {
        if (this.store.zoneEntityIds(evaluateString(requirement.zone, context)).length === 0) {
          failures.push({ id: requirement.id, message: requirement.message });
        }
        continue;
      }
      if (requirement.kind === 'entity-in-zone') {
        if (!this.store.zoneEntityIds(evaluateString(requirement.zone, context))
          .includes(evaluateString(requirement.entity, context))) {
          failures.push({ id: requirement.id, message: requirement.message });
        }
        continue;
      }
      if (requirement.kind === 'entities-in-zone') {
        const zoneEntities = this.store.zoneEntityIds(evaluateString(requirement.zone, context));
        if (evaluateStringArray(requirement.entities, context).some((id) => !zoneEntities.includes(id))) {
          failures.push({ id: requirement.id, message: requirement.message });
        }
        continue;
      }
      if (requirement.kind === 'entities-distinct') {
        const ids = evaluateStringArray(requirement.entities, context);
        if (new Set(ids).size !== ids.length) failures.push({ id: requirement.id, message: requirement.message });
        continue;
      }
      if (requirement.kind === 'parameter-present') {
        if (!(requirement.parameter in context.parameters)) failures.push({ id: requirement.id, message: requirement.message });
        continue;
      }
      if (requirement.kind === 'array-length') {
        const value = evaluateValue(requirement.value, context);
        if (!Array.isArray(value) || value.length !== requirement.length) {
          failures.push({ id: requirement.id, message: requirement.message });
        }
        continue;
      }
      if (requirement.kind === 'response-window-open') {
        const id = evaluateString(requirement.windowId, context);
        try {
          const window = this.windows.read(id);
          if (!this.windows.canSubmit(id, context.actorId, context.actionId ?? '')) {
            failures.push({ id: requirement.id, message: requirement.message });
          } else {
            context.window = window;
          }
        } catch {
          failures.push({ id: requirement.id, message: requirement.message });
        }
        continue;
      }
      if (requirement.kind === 'actor-relative-position') {
        const source = evaluateString(requirement.sourceActor, context);
        const sourceIndex = requirement.order.indexOf(source);
        const expected = requirement.order[(sourceIndex + requirement.offset + requirement.order.length) % requirement.order.length];
        if (context.actorId !== expected) failures.push({ id: requirement.id, message: requirement.message });
        continue;
      }
      if (requirement.kind === 'relation-exists') {
        const source = evaluateEntityRef(requirement.source, context);
        const target = evaluateEntityRef(requirement.target, context);
        const exists = this.store.outgoingRelations(source, requirement.relationType)
          .some((relation) => relation.target.kind === target.kind && relation.target.id === target.id);
        if (!exists) failures.push({ id: requirement.id, message: requirement.message });
        continue;
      }
      if (requirement.kind === 'core.constraint') {
        const result = this.core.evaluateConstraint(requirement.programId, this.coreVariables(context));
        if (!result.satisfiable) failures.push({ id: requirement.id, message: requirement.message });
        continue;
      }

      const ids = evaluateStringArray(requirement.entities, context);
      if (requirement.includeEntity) ids.push(evaluateString(requirement.includeEntity, context));
      const values = ids.map((id) => this.store.readEntityPath(id, requirement.componentPath));
      if (requirement.kind === 'entities-component-equal') {
        if (values.length === 0 || values.some((value) => !primitiveEqual(value, values[0]))) {
          failures.push({ id: requirement.id, message: requirement.message });
        }
        continue;
      }
      const numbers = values.filter((value): value is number => typeof value === 'number');
      const sorted = [...new Set(numbers)].sort((left, right) => left - right);
      if (numbers.length !== requirement.expectedCount
        || sorted.length !== requirement.expectedCount
        || sorted.some((value, index) => index > 0 && value !== sorted[index - 1] + 1)) {
        failures.push({ id: requirement.id, message: requirement.message });
      }
    }
    return failures;
  }

  private executeEffect(
    effect: EffectDefinition,
    context: EvaluationContext,
    actionEntityId?: string,
    attemptEntityId?: string,
  ): string[] {
    if (effect.kind === 'zone.distribute') {
      const eventIds: string[] = [];
      for (const batchSize of effect.batchPattern) {
        for (const destination of effect.destinationZones) {
          for (let count = 0; count < batchSize; count += 1) {
            eventIds.push(...this.moveHead(
              evaluateString(effect.sourceZone, context),
              evaluateString(destination, context),
              {},
              context,
              actionEntityId,
            ));
          }
        }
      }
      return eventIds;
    }
    if (effect.kind === 'zone.move-head') {
      return this.moveHead(
        evaluateString(effect.fromZone, context),
        evaluateString(effect.toZone, context),
        effect.metadata ?? {},
        context,
        actionEntityId,
      );
    }
    if (effect.kind === 'zone.move-entity') {
      return this.moveOne(
        evaluateString(effect.entity, context),
        evaluateString(effect.fromZone, context),
        evaluateString(effect.toZone, context),
        effect.metadata ?? {},
        context,
        actionEntityId,
        false,
      );
    }
    if (effect.kind === 'zone.claim-entity') {
      return this.moveOne(
        evaluateString(effect.entity, context),
        evaluateString(effect.fromZone, context),
        evaluateString(effect.toZone, context),
        effect.metadata ?? {},
        context,
        actionEntityId,
        true,
      );
    }
    if (effect.kind === 'zone.move-entities') {
      const eventIds: string[] = [];
      for (const entityId of evaluateStringArray(effect.entities, context)) {
        eventIds.push(...this.moveOne(
          entityId,
          evaluateString(effect.fromZone, context),
          evaluateString(effect.toZone, context),
          effect.metadata ?? {},
          context,
          actionEntityId,
          false,
        ));
      }
      return eventIds;
    }
    if (effect.kind === 'zone.place-entity') {
      this.store.place(evaluateString(effect.zone, context), evaluateString(effect.entity, context), {
        metadata: effect.metadata ?? {},
      });
      return [];
    }
    if (effect.kind === 'entity.create') {
      const id = evaluateString(effect.entityId, context);
      this.store.createEntity({
        id,
        kind: effect.entityKind,
        components: evaluateDynamic(effect.components, context) as Record<string, unknown>,
      });
      context.lastCreatedEntityId = id;
      return [];
    }
    if (effect.kind === 'relation.connect') {
      this.connect(
        effect.relationType,
        evaluateEntityRef(effect.source, context),
        evaluateEntityRef(effect.target, context),
        evaluateDynamic(effect.metadata ?? {}, context) as Record<string, unknown>,
      );
      return [];
    }
    if (effect.kind === 'relation.connect-many') {
      const source = evaluateEntityRef(effect.source, context);
      for (const id of evaluateStringArray(effect.targetIds, context)) {
        this.connect(
          effect.relationType,
          source,
          { kind: effect.targetKind, id },
          evaluateDynamic(effect.metadata ?? {}, context) as Record<string, unknown>,
        );
      }
      return [];
    }
    if (effect.kind === 'event.emit') {
      const event = this.journal.append({
        type: effect.eventType,
        revision: this.revision,
        actorId: context.actorId,
        subjects: (effect.subjects ?? []).map((entry) => evaluateEntityRef(entry, context)),
        objects: (effect.objects ?? []).map((entry) => evaluateEntityRef(entry, context)),
        causedByActionId: actionEntityId,
        payload: evaluatePayload(effect.payload, context),
      });
      context.lastEventId = event.id;
      return [event.id];
    }
    if (effect.kind === 'core.rewrite') {
      const rewritten = this.core.applyRewrite(
        effect.programId,
        { world: this.store.snapshot() },
        this.coreVariables(context),
      );
      const validated = new WorldStateStore(rewritten.world);
      this.store.restore(validated.snapshot());
      return [];
    }
    if (effect.kind === 'procedure.spawn') {
      const token = this.scheduler.spawn(
        effect.procedureId,
        evaluateString(effect.owner, context),
        effect.nodeId,
        effect.tokenId ? evaluateString(effect.tokenId, context) : undefined,
      );
      this.enterNode(token.id, (context.automaticDepth ?? 0) + 1);
      return [];
    }
    if (effect.kind === 'response-window.open') {
      const window = this.windows.open({
        definitionId: effect.definitionId,
        id: evaluateString(effect.windowId, context),
        sourceActorId: evaluateString(effect.sourceActor, context),
        sourceEventId: evaluateString(effect.sourceEvent, context),
        sourceEntityId: evaluateString(effect.sourceEntity, context),
        parentTokenId: evaluateString(effect.parentTokenId, context),
      });
      this.store.createEntity({
        id: window.id,
        kind: 'response-window',
        components: { responseWindow: structuredClone(window) },
      });
      this.connect('responds-to', { kind: 'response-window', id: window.id }, { kind: 'event', id: window.sourceEventId });
      this.connect('targets', { kind: 'response-window', id: window.id }, { kind: 'tile', id: window.sourceEntityId });
      const event = this.journal.append({
        type: 'response-window.opened',
        revision: this.revision,
        actorId: window.sourceActorId,
        subjects: [{ kind: 'response-window', id: window.id }],
        objects: [{ kind: 'event', id: window.sourceEventId }, { kind: 'tile', id: window.sourceEntityId }],
        payload: { participants: window.participants, definitionId: window.definitionId },
      });
      return [event.id];
    }
    if (effect.kind === 'response-window.submit') {
      if (!actionEntityId || !attemptEntityId) throw new Error('Response submission requires action entities.');
      const id = evaluateString(effect.windowId, context);
      const window = this.windows.read(id);
      context.window = window;
      this.connect('responds-to', { kind: 'action', id: actionEntityId }, { kind: 'event', id: window.sourceEventId });
      this.connect('targets', { kind: 'action', id: actionEntityId }, { kind: 'tile', id: window.sourceEntityId });
      const submission: RuntimeResponseSubmission = {
        actorId: context.actorId,
        actionId: context.actionId ?? '',
        parameters: structuredClone(context.parameters),
        actionEntityId,
        attemptEntityId,
      };
      const submitted = this.journal.append({
        type: 'response.submitted',
        revision: this.revision,
        actorId: context.actorId,
        subjects: [{ kind: 'action', id: actionEntityId }],
        objects: [{ kind: 'response-window', id }],
        causedByActionId: actionEntityId,
        payload: { actionId: submission.actionId },
      });
      const resolution = this.windows.submit(id, submission);
      if (!resolution) {
        this.store.setComponent(id, 'responseWindow', this.windows.read(id));
        return [submitted.id];
      }

      this.store.setComponent(id, 'responseWindow', resolution.window);
      const resolved = this.journal.append({
        type: 'response-window.resolved',
        revision: this.revision,
        subjects: [{ kind: 'response-window', id }],
        objects: resolution.selected.map((entry) => ({ kind: 'action', id: entry.actionEntityId })),
        payload: {
          selected: resolution.selected.map((entry) => ({ actorId: entry.actorId, actionId: entry.actionId })),
        },
      });
      const definition = this.windows.definition(resolution.window.definitionId);
      const eventIds = [submitted.id, resolved.id];
      if (resolution.selected.length === 0) {
        const resolutionContext: EvaluationContext = {
          ...context,
          actorId: resolution.window.sourceActorId,
          parameters: {},
          window: resolution.window,
          submission: undefined,
        };
        for (const selectedEffect of definition.noSelectionEffects) {
          eventIds.push(...this.executeEffect(selectedEffect, resolutionContext));
        }
      } else {
        for (const selected of resolution.selected) {
          const resolutionContext: EvaluationContext = {
            actorId: selected.actorId,
            actionId: selected.actionId,
            actionEntityId: selected.actionEntityId,
            parameters: selected.parameters,
            window: resolution.window,
            submission: selected,
          };
          this.connect('selected-by', { kind: 'action', id: selected.actionEntityId }, { kind: 'response-window', id });
          for (const selectedEffect of definition.selectionEffects[selected.actionId] ?? []) {
            eventIds.push(...this.executeEffect(
              selectedEffect,
              resolutionContext,
              selected.actionEntityId,
              selected.attemptEntityId,
            ));
          }
        }
      }
      return eventIds;
    }

    const tokenId = 'tokenId' in effect && effect.tokenId
      ? evaluateString(effect.tokenId, context)
      : context.token?.id;
    if (!tokenId) throw new Error(`${effect.kind} requires a procedure token.`);
    if (effect.kind === 'procedure.transition') {
      const token = this.scheduler.transition(tokenId, effect.nodeId);
      context.token = token;
      this.enterNode(token.id, (context.automaticDepth ?? 0) + 1);
      return [];
    }
    if (effect.kind === 'procedure.rotate-owner') {
      const token = this.scheduler.rotateOwner(tokenId, effect.order, effect.nodeId);
      context.token = token;
      this.enterNode(token.id, (context.automaticDepth ?? 0) + 1);
      return [];
    }
    const token = this.scheduler.setOwner(tokenId, evaluateString(effect.owner, context), effect.nodeId);
    context.token = token;
    this.enterNode(token.id, (context.automaticDepth ?? 0) + 1);
    return [];
  }

  private coreVariables(context: EvaluationContext): Record<string, unknown> {
    return {
      actorId: context.actorId,
      attemptId: context.attemptId,
      actionId: context.actionId,
      actionEntityId: context.actionEntityId,
      params: structuredClone(context.parameters),
      token: context.token ? structuredClone(context.token) : undefined,
      window: context.window ? structuredClone(context.window) : undefined,
      submission: context.submission ? structuredClone(context.submission) : undefined,
      revision: this.revision,
      world: this.store.snapshot(),
      events: this.journal.all(),
      reducers: this.core.allReducerStates(),
    };
  }

  private moveOne(
    entityId: string,
    fromZone: string,
    toZone: string,
    metadata: Record<string, unknown>,
    context: EvaluationContext,
    actionEntityId?: string,
    claim = false,
  ): string[] {
    if (claim) {
      this.store.claim(entityId, fromZone, toZone, {
        metadata,
        claimedByActionId: actionEntityId ?? 'system',
      });
    } else {
      this.store.move(entityId, fromZone, toZone, { metadata });
    }
    context.lastMovedEntityId = entityId;
    if (actionEntityId) this.connect('targets', { kind: 'action', id: actionEntityId }, { kind: 'tile', id: entityId });
    return [this.movementEvent(entityId, fromZone, toZone, context.actorId, actionEntityId, claim).id];
  }

  private moveHead(
    source: string,
    destination: string,
    metadata: Record<string, unknown>,
    context: EvaluationContext,
    actionEntityId?: string,
  ): string[] {
    const entityId = this.store.zoneEntityIds(source)[0];
    if (!entityId) throw new Error(`Zone ${source} is empty.`);
    return this.moveOne(entityId, source, destination, metadata, context, actionEntityId, false);
  }

  private movementEvent(
    entityId: string,
    fromZone: string,
    toZone: string,
    actorId?: string,
    actionEntityId?: string,
    claimed = false,
  ) {
    return this.journal.append({
      type: claimed ? 'entity.claimed' : 'entity.moved',
      revision: this.revision,
      actorId,
      subjects: [{ kind: 'tile', id: entityId }],
      objects: [{ kind: 'zone', id: toZone }],
      causedByActionId: actionEntityId,
      payload: { fromZone, toZone },
    });
  }

  private enterNode(tokenId: string, depth: number): void {
    if (depth > 64) throw new Error('Automatic procedure depth exceeded.');
    const token = this.scheduler.require(tokenId);
    const node = this.scheduler.node(token);
    if (!node.onEnter?.length) return;
    const context: EvaluationContext = {
      actorId: token.ownerId,
      parameters: {},
      token: structuredClone(token),
      automaticDepth: depth,
    };
    for (const effect of node.onEnter) this.executeEffect(effect, context);
  }

  private connect(
    type: string,
    source: WorldRef,
    target: WorldRef,
    metadata: Record<string, unknown> = {},
  ): void {
    this.store.connect({ id: `relation:${++this.relationSequence}`, type, source, target, metadata });
  }

  private recordReceipt(receipt: WorldActionReceipt): WorldActionReceipt {
    this.receipts.set(receipt.attemptId, structuredClone(receipt));
    return structuredClone(receipt);
  }
}
