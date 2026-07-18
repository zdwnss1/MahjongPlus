export type EntityId = string;
export type ZoneId = string;
export type RelationId = string;

export interface WorldRef { kind: string; id: string }
export interface EntityRecord { id: EntityId; kind: string; components: Record<string, unknown> }
export type ZoneEntryState = 'occupied' | 'claimed' | 'removed';
export interface ZoneEntry {
  slotId: string;
  entityId: EntityId;
  ordinal: number;
  metadata: Record<string, unknown>;
  state?: ZoneEntryState;
  claimedByActionId?: string;
  removedByActionId?: string;
}
export interface ZoneRecord {
  id: ZoneId;
  kind: string;
  ordered: boolean;
  capacity?: number;
  entries: ZoneEntry[];
  metadata: Record<string, unknown>;
}
export interface RelationRecord {
  id: RelationId;
  type: string;
  source: WorldRef;
  target: WorldRef;
  metadata: Record<string, unknown>;
}
export interface WorldStateSnapshot {
  entities: EntityRecord[];
  zones: ZoneRecord[];
  relations: RelationRecord[];
  slotSequence?: number;
}
export interface CreateZoneInput extends Omit<ZoneRecord, 'entries' | 'metadata'> {
  entries?: ZoneEntry[];
  metadata?: Record<string, unknown>;
}
export interface PlaceOptions {
  index?: number;
  slotId?: string;
  metadata?: Record<string, unknown>;
}
export interface ClaimOptions extends PlaceOptions {
  claimedByActionId: string;
}
