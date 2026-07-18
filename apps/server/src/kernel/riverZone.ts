import type { EntityRef } from './entityGraph.js';

export type RiverSlotState = 'occupied' | 'claimed' | 'removed';
export type TileOrientation = 'upright' | 'sideways';

export interface RiverLayoutPolicy {
  columnsPerRow: number;
  allowStacking: boolean;
}

export interface RiverSlot {
  id: string;
  ownerId: string;
  ordinal: number;
  row: number;
  column: number;
  stackLevel: number;
  tile: EntityRef<'tile'>;
  discardEvent: EntityRef<'event'>;
  orientation: TileOrientation;
  state: RiverSlotState;
  claimedByAction?: EntityRef<'action' | 'action-attempt'>;
}

export const STANDARD_RIVER_LAYOUT: RiverLayoutPolicy = {
  columnsPerRow: 6,
  allowStacking: false,
};

export class RiverZone {
  private readonly slots: RiverSlot[] = [];

  constructor(
    readonly id: string,
    readonly ownerId: string,
    private readonly policy: RiverLayoutPolicy = STANDARD_RIVER_LAYOUT,
  ) {
    if (!Number.isInteger(policy.columnsPerRow) || policy.columnsPerRow < 1) throw new Error('River columns must be positive.');
  }

  place(tileId: string, discardEventId: string, orientation: TileOrientation = 'upright', stackLevel = 0): RiverSlot {
    if (!this.policy.allowStacking && stackLevel !== 0) throw new Error('This river layout does not allow stacking.');
    const ordinal = this.slots.length;
    const slot: RiverSlot = {
      id: `${this.id}:slot:${ordinal}`,
      ownerId: this.ownerId,
      ordinal,
      row: Math.floor(ordinal / this.policy.columnsPerRow),
      column: ordinal % this.policy.columnsPerRow,
      stackLevel,
      tile: { kind: 'tile', id: tileId },
      discardEvent: { kind: 'event', id: discardEventId },
      orientation,
      state: 'occupied',
    };
    this.slots.push(slot);
    return this.cloneSlot(slot);
  }

  claim(slotId: string, actionId: string): RiverSlot {
    const slot = this.requireSlot(slotId);
    if (slot.state !== 'occupied') throw new Error('Only an occupied river slot can be claimed.');
    slot.state = 'claimed';
    slot.claimedByAction = { kind: 'action', id: actionId };
    return this.cloneSlot(slot);
  }

  remove(slotId: string): RiverSlot {
    const slot = this.requireSlot(slotId);
    slot.state = 'removed';
    return this.cloneSlot(slot);
  }

  snapshot(): RiverSlot[] {
    return this.slots.map((slot) => this.cloneSlot(slot));
  }

  private requireSlot(slotId: string): RiverSlot {
    const slot = this.slots.find((candidate) => candidate.id === slotId);
    if (!slot) throw new Error(`Unknown river slot: ${slotId}`);
    return slot;
  }

  private cloneSlot(slot: RiverSlot): RiverSlot {
    return {
      ...slot,
      tile: { ...slot.tile },
      discardEvent: { ...slot.discardEvent },
      claimedByAction: slot.claimedByAction ? { ...slot.claimedByAction } : undefined,
    };
  }
}
