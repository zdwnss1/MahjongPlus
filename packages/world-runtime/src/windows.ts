import type { ResponseWindowDefinition } from '@mahjongplus/world-language';
import type { RuntimeResponseSubmission, RuntimeResponseWindow } from './types.js';

export interface ResponseWindowSnapshot {
  windows: RuntimeResponseWindow[];
}

export interface OpenWindowInput {
  definitionId: string;
  id: string;
  sourceActorId: string;
  sourceEventId: string;
  sourceEntityId: string;
  parentTokenId: string;
}

export interface WindowResolution {
  window: RuntimeResponseWindow;
  selected: RuntimeResponseSubmission[];
}

const clone = <T>(value: T): T => structuredClone(value);

export class ResponseWindowManager {
  private readonly definitions: Map<string, ResponseWindowDefinition>;
  private readonly windows = new Map<string, RuntimeResponseWindow>();

  constructor(definitions: ResponseWindowDefinition[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  open(input: OpenWindowInput): RuntimeResponseWindow {
    if (this.windows.has(input.id)) throw new Error(`Duplicate response window ${input.id}`);
    const definition = this.requireDefinition(input.definitionId);
    const participants = definition.participantOrder.filter((id) =>
      !definition.excludeSourceActor || id !== input.sourceActorId);
    const window: RuntimeResponseWindow = {
      ...input,
      participants,
      submissions: {},
      state: 'open',
      selected: [],
    };
    this.windows.set(window.id, window);
    return clone(window);
  }

  require(id: string): RuntimeResponseWindow {
    const window = this.windows.get(id);
    if (!window) throw new Error(`Unknown response window: ${id}`);
    return window;
  }

  read(id: string): RuntimeResponseWindow {
    return clone(this.require(id));
  }

  openWindows(): RuntimeResponseWindow[] {
    return [...this.windows.values()].filter((window) => window.state === 'open').map(clone);
  }

  canSubmit(id: string, actorId: string, actionId: string): boolean {
    const window = this.require(id);
    const definition = this.requireDefinition(window.definitionId);
    return window.state === 'open'
      && window.participants.includes(actorId)
      && definition.allowedActionIds.includes(actionId)
      && !window.submissions[actorId];
  }

  submit(id: string, submission: RuntimeResponseSubmission): WindowResolution | undefined {
    const window = this.require(id);
    if (!this.canSubmit(id, submission.actorId, submission.actionId)) {
      throw new Error('Response submission is not allowed.');
    }
    window.submissions[submission.actorId] = clone(submission);
    if (Object.keys(window.submissions).length < window.participants.length) return undefined;

    const selected = this.resolve(window);
    window.state = 'resolved';
    window.selected = clone(selected);
    return { window: clone(window), selected: clone(selected) };
  }

  definition(id: string): ResponseWindowDefinition {
    return clone(this.requireDefinition(id));
  }

  snapshot(): ResponseWindowSnapshot {
    return { windows: [...this.windows.values()].map(clone) };
  }

  restore(snapshot: ResponseWindowSnapshot): void {
    this.windows.clear();
    for (const window of snapshot.windows) this.windows.set(window.id, clone(window));
  }

  private resolve(window: RuntimeResponseWindow): RuntimeResponseSubmission[] {
    const definition = this.requireDefinition(window.definitionId);
    const submissions = Object.values(window.submissions);
    for (const tier of definition.tiers) {
      const candidates = submissions
        .filter((submission) => tier.actionIds.includes(submission.actionId))
        .sort((left, right) => this.distance(window, left.actorId) - this.distance(window, right.actorId));
      if (candidates.length === 0) continue;
      const limit = tier.selection === 'single' ? 1 : (tier.maxSelections ?? candidates.length);
      return candidates.slice(0, limit);
    }
    return [];
  }

  private distance(window: RuntimeResponseWindow, actorId: string): number {
    const definition = this.requireDefinition(window.definitionId);
    const source = definition.participantOrder.indexOf(window.sourceActorId);
    const actor = definition.participantOrder.indexOf(actorId);
    return (actor - source + definition.participantOrder.length) % definition.participantOrder.length;
  }

  private requireDefinition(id: string): ResponseWindowDefinition {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown response window definition: ${id}`);
    return definition;
  }
}
