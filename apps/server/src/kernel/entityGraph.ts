export type EntityKind =
  | 'tile'
  | 'tile-kind'
  | 'player'
  | 'action'
  | 'action-attempt'
  | 'adjudication'
  | 'event'
  | 'effect'
  | 'rule'
  | 'binding'
  | 'zone'
  | 'zone-slot'
  | 'wall-stack'
  | 'dice-roll';

export interface EntityRef<K extends EntityKind = EntityKind> {
  kind: K;
  id: string;
}

export type RelationVisibility = 'public' | 'owner' | 'server-secret';

export type RelationType =
  | 'targets'
  | 'responds-to'
  | 'caused-by'
  | 'derived-from'
  | 'moves'
  | 'from-zone'
  | 'to-zone'
  | 'occupies'
  | 'contains'
  | 'claimed-by'
  | 'carries-binding'
  | 'triggered-by'
  | 'modifies'
  | 'reveals'
  | 'scores-with'
  | `custom:${string}`;

export interface RelationEdge {
  id: string;
  type: RelationType;
  source: EntityRef;
  target: EntityRef;
  createdEventId?: string;
  sourceRuleId?: string;
  visibility: RelationVisibility;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ConnectRelationInput extends Omit<RelationEdge, 'id' | 'visibility'> {
  id?: string;
  visibility?: RelationVisibility;
}

export function entityKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function sameEntity(left: EntityRef | undefined, right: EntityRef | undefined): boolean {
  return Boolean(left && right && left.kind === right.kind && left.id === right.id);
}

function cloneRef(ref: EntityRef): EntityRef {
  return { kind: ref.kind, id: ref.id };
}

function cloneEdge(edge: RelationEdge): RelationEdge {
  return {
    ...edge,
    source: cloneRef(edge.source),
    target: cloneRef(edge.target),
    metadata: edge.metadata ? { ...edge.metadata } : undefined,
  };
}

export class EntityRelationGraph {
  private sequence = 0;
  private readonly edges = new Map<string, RelationEdge>();
  private readonly outgoingIndex = new Map<string, Set<string>>();
  private readonly incomingIndex = new Map<string, Set<string>>();

  connect(input: ConnectRelationInput): RelationEdge {
    if (!input.source.id || !input.target.id) throw new Error('Relation endpoints require stable ids.');
    const id = input.id ?? `relation_${++this.sequence}`;
    if (this.edges.has(id)) throw new Error(`Duplicate relation id: ${id}`);
    const edge: RelationEdge = {
      ...input,
      id,
      visibility: input.visibility ?? 'public',
      source: cloneRef(input.source),
      target: cloneRef(input.target),
      metadata: input.metadata ? { ...input.metadata } : undefined,
    };
    this.edges.set(id, edge);
    this.addIndex(this.outgoingIndex, entityKey(edge.source), id);
    this.addIndex(this.incomingIndex, entityKey(edge.target), id);
    return cloneEdge(edge);
  }

  outgoing(source: EntityRef, type?: RelationType): RelationEdge[] {
    return this.readIndex(this.outgoingIndex, entityKey(source), type);
  }

  incoming(target: EntityRef, type?: RelationType): RelationEdge[] {
    return this.readIndex(this.incomingIndex, entityKey(target), type);
  }

  between(source: EntityRef, target: EntityRef, type?: RelationType): RelationEdge[] {
    return this.outgoing(source, type).filter((edge) => sameEntity(edge.target, target));
  }

  references(entity: EntityRef, candidate: EntityRef, relationTypes?: readonly RelationType[]): boolean {
    return this.outgoing(entity).some((edge) => {
      if (relationTypes && !relationTypes.includes(edge.type)) return false;
      return sameEntity(edge.target, candidate);
    });
  }

  snapshot(): RelationEdge[] {
    return [...this.edges.values()].map(cloneEdge);
  }

  private addIndex(index: Map<string, Set<string>>, key: string, edgeId: string): void {
    const values = index.get(key) ?? new Set<string>();
    values.add(edgeId);
    index.set(key, values);
  }

  private readIndex(index: Map<string, Set<string>>, key: string, type?: RelationType): RelationEdge[] {
    return [...(index.get(key) ?? [])]
      .map((id) => this.edges.get(id))
      .filter((edge): edge is RelationEdge => Boolean(edge && (!type || edge.type === type)))
      .map(cloneEdge);
  }
}
