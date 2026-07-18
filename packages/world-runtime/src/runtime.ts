import type {
  ActionDefinition,
  EffectDefinition,
  RequirementDefinition,
  WorldImage,
} from '@mahjongplus/world-language';
import { WorldStateStore, type WorldRef } from '@mahjongplus/world-model';
import { evaluateEntityRef, evaluatePayload, evaluateString, type EvaluationContext } from './expressions.js';
import { RuntimeJournal } from './journal.js';
import { ProcedureScheduler } from './scheduler.js';
import type {
  RequirementFailure,
  WorldActionAttempt,
  WorldActionReceipt,
} from './types.js';

export class WorldRuntime {
  readonly store: WorldStateStore;
  readonly scheduler: ProcedureScheduler;
  readonly journal: RuntimeJournal;
  private readonly actions: Map<string, ActionDefinition>;
  private readonly receipts = new Map<string, WorldActionReceipt>();
  private revision = 0;
  private actionSequence = 0;
  private relationSequence = 0;

  constructor(readonly image: WorldImage) {
    this.store = new WorldStateStore({ entities: image.entities, zones: image.zones, relations: image.relations });
    this.scheduler = new ProcedureScheduler(image.procedures);
    this.journal = new RuntimeJournal(this.store);
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
    this.store.createEntity({ id: attemptEntityId, kind: 'action-attempt', components: { attempt: structuredClone(attempt) } });
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
      const rejected = this.journal.append({
        type: 'action.rejected',
        revision: this.revision,
        actorId: attempt.actorId,
        subjects: [{ kind: 'action-attempt', id: attemptEntityId }],
        objects: [],
        payload: { failures: [{ id: 'action.unknown', message: `Unknown action ${attempt.actionId}.` }] },
      });
      return this.recordReceipt({
        attemptId: attempt.attemptId,
        outcome: 'invalid',
        revisionBefore,
        revisionAfter: this.revision,
        failures: [{ id: 'action.unknown', message: `Unknown action ${attempt.actionId}.` }],
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
    const actionEntityId = `action:${++this.actionSequence}`;
    const eventIds = [attemptedEvent.id];
    try {
      this.store.createEntity({
        id: actionEntityId,
        kind: 'action',
        components: { action: { definitionId: action.id, actorId: attempt.actorId, parameters: structuredClone(attempt.parameters) } },
      });
      this.connect('derived-from', { kind: 'action', id: actionEntityId }, { kind: 'action-attempt', id: attemptEntityId });
      this.connect('performed-by', { kind: 'action', id: actionEntityId }, { kind: 'player', id: attempt.actorId });
      for (const effect of action.effects) eventIds.push(...this.executeEffect(effect, context, actionEntityId));
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
      if (typeof value !== expected) failures.push({ id: `parameter.${name}.type`, message: `Parameter ${name} must be ${expected}.` });
    }
    return failures;
  }

  private evaluateRequirements(requirements: RequirementDefinition[], context: EvaluationContext): RequirementFailure[] {
    const failures: RequirementFailure[] = [];
    for (const requirement of requirements) {
      if (requirement.kind === 'procedure-token') {
        const ownerId = requirement.owner === 'actor'
          ? context.actorId
          : evaluateString(requirement.owner.value, context);
        const token = this.scheduler.find(requirement.procedureId, requirement.nodeId, ownerId);
        if (!token) failures.push({ id: requirement.id, message: requirement.message });
        else context.token = token;
      } else if (requirement.kind === 'zone-not-empty') {
        const zoneId = evaluateString(requirement.zone, context);
        if (this.store.zoneEntityIds(zoneId).length === 0) failures.push({ id: requirement.id, message: requirement.message });
      } else if (requirement.kind === 'entity-in-zone') {
        const entityId = evaluateString(requirement.entity, context);
        const zoneId = evaluateString(requirement.zone, context);
        if (!this.store.zoneEntityIds(zoneId).includes(entityId)) failures.push({ id: requirement.id, message: requirement.message });
      } else if (!(requirement.parameter in context.parameters)) {
        failures.push({ id: requirement.id, message: requirement.message });
      }
    }
    return failures;
  }

  private executeEffect(effect: EffectDefinition, context: EvaluationContext, actionEntityId?: string): string[] {
    if (effect.kind === 'zone.distribute') {
      const source = evaluateString(effect.sourceZone, context);
      const destinations = effect.destinationZones.map((expression) => evaluateString(expression, context));
      const ids: string[] = [];
      for (const batchSize of effect.batchPattern) {
        for (const destination of destinations) {
          for (let count = 0; count < batchSize; count += 1) ids.push(...this.moveHead(source, destination, {}, context, actionEntityId));
        }
      }
      return ids;
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
      const entityId = evaluateString(effect.entity, context);
      const fromZone = evaluateString(effect.fromZone, context);
      const toZone = evaluateString(effect.toZone, context);
      this.store.move(entityId, fromZone, toZone, { metadata: effect.metadata ?? {} });
      context.lastMovedEntityId = entityId;
      if (actionEntityId) this.connect('targets', { kind: 'action', id: actionEntityId }, { kind: 'tile', id: entityId });
      return [this.movementEvent(entityId, fromZone, toZone, context.actorId, actionEntityId).id];
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
      return [event.id];
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
    if (!context.token) throw new Error(`${effect.kind} requires a procedure token context.`);
    if (effect.kind === 'procedure.transition') {
      const token = this.scheduler.transition(context.token.id, effect.nodeId);
      context.token = token;
      this.enterNode(token.id, (context.automaticDepth ?? 0) + 1);
      return [];
    }
    const token = this.scheduler.rotateOwner(context.token.id, effect.order, effect.nodeId);
    context.token = token;
    this.enterNode(token.id, (context.automaticDepth ?? 0) + 1);
    return [];
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
    this.store.moveHead(source, destination, { metadata });
    context.lastMovedEntityId = entityId;
    if (actionEntityId) this.connect('targets', { kind: 'action', id: actionEntityId }, { kind: 'tile', id: entityId });
    return [this.movementEvent(entityId, source, destination, context.actorId, actionEntityId).id];
  }

  private movementEvent(entityId: string, fromZone: string, toZone: string, actorId?: string, actionEntityId?: string) {
    return this.journal.append({
      type: 'entity.moved',
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
    const context: EvaluationContext = { actorId: token.ownerId, parameters: {}, token: structuredClone(token), automaticDepth: depth };
    for (const effect of node.onEnter) this.executeEffect(effect, context);
  }

  private connect(type: string, source: WorldRef, target: WorldRef): void {
    this.store.connect({ id: `relation:${++this.relationSequence}`, type, source, target, metadata: {} });
  }

  private recordReceipt(receipt: WorldActionReceipt): WorldActionReceipt {
    this.receipts.set(receipt.attemptId, structuredClone(receipt));
    return structuredClone(receipt);
  }
}
