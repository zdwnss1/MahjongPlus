import type {
  CreateZoneInput,
  EntityRecord,
  PlaceOptions,
  RelationRecord,
  WorldRef,
  WorldStateSnapshot,
  ZoneEntry,
  ZoneRecord,
} from './types.js';

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function refKey(ref: WorldRef): string {
  return `${ref.kind}:${ref.id}`;
}

export class WorldStateStore {
  private readonly entities = new Map<string, EntityRecord>();
  private readonly zones = new Map<string, ZoneRecord>();
  private readonly relations = new Map<string, RelationRecord>();
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();
  private slotSequence = 0;

  constructor(snapshot?: WorldStateSnapshot) {
    if (!snapshot) return;
    this.slotSequence = snapshot.slotSequence ?? 0;
    for (const entity of snapshot.entities) this.createEntity(entity);
    for (const zone of snapshot.zones) this.createZone(zone);
    for (const relation of snapshot.relations) this.connect(relation);
  }

  createEntity(entity: EntityRecord): EntityRecord {
    if (!entity.id) throw new Error('Entity id is required.');
    if (this.entities.has(entity.id)) throw new Error(`Duplicate entity id: ${entity.id}`);
    const record = cloneValue(entity);
    this.entities.set(record.id, record);
    return cloneValue(record);
  }

  requireEntity(entityId: string): EntityRecord {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Unknown entity: ${entityId}`);
    return entity;
  }

  readEntity(entityId: string): EntityRecord {
    return cloneValue(this.requireEntity(entityId));
  }

  entitiesOfKind(kind: string): EntityRecord[] {
    return [...this.entities.values()].filter((entity) => entity.kind === kind).map(cloneValue);
  }

  setComponent(entityId: string, component: string, value: unknown): void {
    this.requireEntity(entityId).components[component] = cloneValue(value);
  }

  readComponent<T = unknown>(entityId: string, component: string): T | undefined {
    return cloneValue(this.requireEntity(entityId).components[component] as T | undefined);
  }

  createZone(input: CreateZoneInput | ZoneRecord): ZoneRecord {
    if (!input.id) throw new Error('Zone id is required.');
    if (this.zones.has(input.id)) throw new Error(`Duplicate zone id: ${input.id}`);
    const zone: ZoneRecord = {
      id: input.id,
      kind: input.kind,
      ordered: input.ordered,
      capacity: input.capacity,
      metadata: cloneValue(input.metadata ?? {}),
      entries: cloneValue(input.entries ?? []),
    };
    this.reindex(zone);
    this.zones.set(zone.id, zone);
    return cloneValue(zone);
  }

  requireZone(zoneId: string): ZoneRecord {
    const zone = this.zones.get(zoneId);
    if (!zone) throw new Error(`Unknown zone: ${zoneId}`);
    return zone;
  }

  readZone(zoneId: string): ZoneRecord {
    return cloneValue(this.requireZone(zoneId));
  }

  zoneEntityIds(zoneId: string): string[] {
    return this.requireZone(zoneId).entries.map((entry) => entry.entityId);
  }

  zoneContaining(entityId: string): ZoneRecord | undefined {
    const zone = [...this.zones.values()].find((candidate) => candidate.entries.some((entry) => entry.entityId === entityId));
    return zone ? cloneValue(zone) : undefined;
  }

  place(zoneId: string, entityId: string, options: PlaceOptions = {}): ZoneEntry {
    this.requireEntity(entityId);
    const zone = this.requireZone(zoneId);
    if (this.zoneContaining(entityId)) throw new Error(`Entity ${entityId} already occupies a zone.`);
    if (zone.capacity != null && zone.entries.length >= zone.capacity) throw new Error(`Zone ${zoneId} is full.`);
    const index = options.index ?? zone.entries.length;
    if (!Number.isInteger(index) || index < 0 || index > zone.entries.length) throw new Error('Invalid zone insertion index.');
    const entry: ZoneEntry = {
      slotId: options.slotId ?? `${zoneId}:slot:auto:${++this.slotSequence}`,
      entityId,
      ordinal: index,
      metadata: cloneValue(options.metadata ?? {}),
    };
    zone.entries.splice(index, 0, entry);
    this.reindex(zone);
    return cloneValue(entry);
  }

  remove(zoneId: string, entityId: string): ZoneEntry {
    const zone = this.requireZone(zoneId);
    const index = zone.entries.findIndex((entry) => entry.entityId === entityId);
    if (index < 0) throw new Error(`Entity ${entityId} is not in zone ${zoneId}.`);
    const [entry] = zone.entries.splice(index, 1);
    this.reindex(zone);
    return cloneValue(entry);
  }

  move(entityId: string, fromZoneId: string, toZoneId: string, options: PlaceOptions = {}): ZoneEntry {
    const removed = this.remove(fromZoneId, entityId);
    try {
      return this.place(toZoneId, entityId, options);
    } catch (error) {
      this.place(fromZoneId, entityId, {
        index: removed.ordinal,
        slotId: removed.slotId,
        metadata: removed.metadata,
      });
      throw error;
    }
  }

  moveHead(fromZoneId: string, toZoneId: string, options: PlaceOptions = {}): ZoneEntry {
    const entityId = this.requireZone(fromZoneId).entries[0]?.entityId;
    if (!entityId) throw new Error(`Zone ${fromZoneId} is empty.`);
    return this.move(entityId, fromZoneId, toZoneId, options);
  }

  connect(relation: RelationRecord): RelationRecord {
    if (!relation.id) throw new Error('Relation id is required.');
    if (this.relations.has(relation.id)) throw new Error(`Duplicate relation id: ${relation.id}`);
    const record = cloneValue(relation);
    this.relations.set(record.id, record);
    this.index(this.outgoing, refKey(record.source), record.id);
    this.index(this.incoming, refKey(record.target), record.id);
    return cloneValue(record);
  }

  outgoingRelations(source: WorldRef, type?: string): RelationRecord[] {
    return this.readRelationIndex(this.outgoing, refKey(source), type);
  }

  incomingRelations(target: WorldRef, type?: string): RelationRecord[] {
    return this.readRelationIndex(this.incoming, refKey(target), type);
  }

  snapshot(): WorldStateSnapshot {
    return {
      entities: [...this.entities.values()].map(cloneValue),
      zones: [...this.zones.values()].map(cloneValue),
      relations: [...this.relations.values()].map(cloneValue),
      slotSequence: this.slotSequence,
    };
  }

  restore(snapshot: WorldStateSnapshot): void {
    this.entities.clear();
    this.zones.clear();
    this.relations.clear();
    this.outgoing.clear();
    this.incoming.clear();
    this.slotSequence = snapshot.slotSequence ?? 0;
    for (const entity of snapshot.entities) this.createEntity(entity);
    for (const zone of snapshot.zones) this.createZone(zone);
    for (const relation of snapshot.relations) this.connect(relation);
  }

  private reindex(zone: ZoneRecord): void {
    zone.entries.forEach((entry, ordinal) => { entry.ordinal = ordinal; });
  }

  private index(index: Map<string, Set<string>>, key: string, relationId: string): void {
    const ids = index.get(key) ?? new Set<string>();
    ids.add(relationId);
    index.set(key, ids);
  }

  private readRelationIndex(index: Map<string, Set<string>>, key: string, type?: string): RelationRecord[] {
    return [...(index.get(key) ?? [])]
      .map((id) => this.relations.get(id))
      .filter((relation): relation is RelationRecord => Boolean(relation && (!type || relation.type === type)))
      .map(cloneValue);
  }
}
