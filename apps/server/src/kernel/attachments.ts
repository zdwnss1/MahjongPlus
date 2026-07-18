import { EntityRelationGraph, type EntityRef, sameEntity } from './entityGraph.js';

export interface BindableEvent {
  id: string;
  type: string;
  subjects: EntityRef[];
  objects: EntityRef[];
  causedBy?: EntityRef<'action' | 'action-attempt'>;
  payload?: Readonly<Record<string, unknown>>;
}

export type BindingVisibility = 'public' | 'owner' | 'server-secret';
export type BindingMatchMode =
  | 'always'
  | 'host-is-subject'
  | 'host-is-object'
  | 'event-references-host'
  | 'causing-action-targets-host';

export interface BindingEffectDescriptor {
  type: string;
  payload?: Readonly<Record<string, unknown>>;
}

export type BindingLifetime =
  | { kind: 'permanent' }
  | { kind: 'charges'; remaining: number }
  | { kind: 'until-event'; eventType: string }
  | { kind: 'until-hand-end' }
  | { kind: 'until-match-end' };

export interface ActiveBinding {
  id: string;
  host: EntityRef;
  eventTypes: string[];
  match: BindingMatchMode;
  effects: BindingEffectDescriptor[];
  lifetime: BindingLifetime;
  visibility: BindingVisibility;
  sourceRuleId: string;
  enabled: boolean;
}

function cloneBinding(binding: ActiveBinding): ActiveBinding {
  return {
    ...binding,
    host: { ...binding.host },
    eventTypes: [...binding.eventTypes],
    effects: binding.effects.map((effect) => ({
      ...effect,
      payload: effect.payload ? { ...effect.payload } : undefined,
    })),
    lifetime: { ...binding.lifetime },
  };
}

export class AttachmentRegistry {
  private readonly bindings = new Map<string, ActiveBinding>();

  attach(binding: ActiveBinding): void {
    if (this.bindings.has(binding.id)) throw new Error(`Duplicate binding id: ${binding.id}`);
    if (!binding.host.id) throw new Error('Binding host requires a stable id.');
    if (binding.lifetime.kind === 'charges' && binding.lifetime.remaining < 1) {
      throw new Error('Charge binding must start with at least one charge.');
    }
    this.bindings.set(binding.id, cloneBinding(binding));
  }

  detach(bindingId: string): void {
    this.bindings.delete(bindingId);
  }

  forHost(host: EntityRef): ActiveBinding[] {
    return [...this.bindings.values()].filter((binding) => sameEntity(binding.host, host)).map(cloneBinding);
  }

  matching(event: BindableEvent, graph: EntityRelationGraph): ActiveBinding[] {
    return [...this.bindings.values()]
      .filter((binding) => binding.enabled)
      .filter((binding) => binding.eventTypes.includes(event.type) || binding.eventTypes.includes('*'))
      .filter((binding) => this.matchesHost(binding, event, graph))
      .map(cloneBinding);
  }

  consume(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (!binding || binding.lifetime.kind !== 'charges') return;
    binding.lifetime.remaining -= 1;
    if (binding.lifetime.remaining <= 0) this.bindings.delete(bindingId);
  }

  expireForEvent(eventType: string): void {
    for (const [id, binding] of this.bindings) {
      if (binding.lifetime.kind === 'until-event' && binding.lifetime.eventType === eventType) {
        this.bindings.delete(id);
      }
      if (binding.lifetime.kind === 'until-hand-end' && eventType === 'hand.ended') this.bindings.delete(id);
      if (binding.lifetime.kind === 'until-match-end' && eventType === 'match.ended') this.bindings.delete(id);
    }
  }

  snapshot(): ActiveBinding[] {
    return [...this.bindings.values()].map(cloneBinding);
  }

  private matchesHost(binding: ActiveBinding, event: BindableEvent, graph: EntityRelationGraph): boolean {
    if (binding.match === 'always') return true;
    if (binding.match === 'host-is-subject') return event.subjects.some((ref) => sameEntity(ref, binding.host));
    if (binding.match === 'host-is-object') return event.objects.some((ref) => sameEntity(ref, binding.host));
    if (binding.match === 'event-references-host') {
      return event.subjects.concat(event.objects).some((ref) => sameEntity(ref, binding.host));
    }
    if (binding.match === 'causing-action-targets-host' && event.causedBy) {
      return graph.references(event.causedBy, binding.host, ['targets']);
    }
    return false;
  }
}
