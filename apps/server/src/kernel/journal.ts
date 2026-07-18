import { nanoid } from 'nanoid';

export interface JournalEvent<T = unknown> {
  id: string;
  sequence: number;
  type: string;
  actorId?: string;
  payload: T;
  createdAt: string;
}

export class EventJournal {
  private sequence = 0;
  private readonly events: JournalEvent[] = [];

  append<T>(type: string, payload: T, actorId?: string): JournalEvent<T> {
    const event: JournalEvent<T> = {
      id: `evt_${nanoid(12)}`,
      sequence: ++this.sequence,
      type,
      actorId,
      payload,
      createdAt: new Date().toISOString(),
    };
    this.events.push(event);
    return event;
  }

  tail(limit = 50): JournalEvent[] {
    return this.events.slice(-limit).map((event) => ({ ...event }));
  }
}
