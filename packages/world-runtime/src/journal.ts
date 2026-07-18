import type { WorldStateStore, WorldRef } from '@mahjongplus/world-model';
import type { RuntimeEvent } from './types.js';

export type RuntimeEventListener = (event: RuntimeEvent, events: RuntimeEvent[]) => void;

export class RuntimeJournal {
  private sequence = 0;
  private readonly events: RuntimeEvent[] = [];

  constructor(
    private readonly store: WorldStateStore,
    private readonly onAppend?: RuntimeEventListener,
  ) {}

  append(input: Omit<RuntimeEvent, 'id'> & { id?: string }): RuntimeEvent {
    const event: RuntimeEvent = {
      ...input,
      id: input.id ?? `event:${++this.sequence}`,
      subjects: input.subjects.map((ref) => ({ ...ref })),
      objects: input.objects.map((ref) => ({ ...ref })),
      payload: structuredClone(input.payload),
    };
    this.events.push(event);
    if (!this.store.entitiesOfKind('event').some((entity) => entity.id === event.id)) {
      this.store.createEntity({ id: event.id, kind: 'event', components: { event: structuredClone(event) } });
    }
    if (event.causedByActionId) {
      this.connect(`relation:${event.id}:caused-by`, 'caused-by', { kind: 'event', id: event.id }, { kind: 'action', id: event.causedByActionId });
    }
    event.subjects.forEach((ref, index) => this.connect(`relation:${event.id}:subject:${index}`, 'has-subject', { kind: 'event', id: event.id }, ref));
    event.objects.forEach((ref, index) => this.connect(`relation:${event.id}:object:${index}`, 'has-object', { kind: 'event', id: event.id }, ref));
    this.onAppend?.(structuredClone(event), this.all());
    return structuredClone(event);
  }

  all(): RuntimeEvent[] {
    return structuredClone(this.events);
  }

  checkpoint(): number {
    return this.events.length;
  }

  truncate(length: number): void {
    this.events.splice(length);
  }

  private connect(id: string, type: string, source: WorldRef, target: WorldRef): void {
    this.store.connect({ id, type, source, target, metadata: {} });
  }
}
