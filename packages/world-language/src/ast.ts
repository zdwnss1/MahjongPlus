import type { CapabilityRequirement } from '@mahjongplus/world-capabilities';
import type { EntityRecord, RelationRecord, ZoneRecord } from '@mahjongplus/world-model';

export type Primitive = string | number | boolean | null;
export type ParameterType = 'string' | 'number' | 'boolean' | 'string[]';

export interface CapabilityCallExpression {
  kind: 'capability-call';
  capabilityId: string;
  version?: string;
  input: unknown;
}

export type ValueExpression =
  | { kind: 'literal'; value: unknown }
  | { kind: 'context'; path: string }
  | { kind: 'template'; template: string }
  | { kind: 'last-moved-entity' }
  | { kind: 'last-created-entity' }
  | CapabilityCallExpression;

export type EntityReferenceExpression =
  | { kind: 'entity'; entityKind: string; id: ValueExpression }
  | { kind: 'actor' }
  | { kind: 'last-moved-entity'; entityKind?: string }
  | { kind: 'last-created-entity'; entityKind?: string }
  | { kind: 'window-source-entity'; entityKind?: string }
  | { kind: 'window-source-event' };

export type RequirementDefinition =
  | {
      id: string;
      kind: 'procedure-token';
      procedureId: string;
      nodeId: string;
      owner: 'actor' | { value: ValueExpression };
      message: string;
    }
  | { id: string; kind: 'zone-not-empty'; zone: ValueExpression; message: string }
  | { id: string; kind: 'entity-in-zone'; entity: ValueExpression; zone: ValueExpression; message: string }
  | { id: string; kind: 'entities-in-zone'; entities: ValueExpression; zone: ValueExpression; message: string }
  | { id: string; kind: 'entities-distinct'; entities: ValueExpression; message: string }
  | {
      id: string;
      kind: 'entities-component-equal';
      entities: ValueExpression;
      includeEntity?: ValueExpression;
      componentPath: string;
      message: string;
    }
  | {
      id: string;
      kind: 'entities-component-consecutive';
      entities: ValueExpression;
      includeEntity?: ValueExpression;
      componentPath: string;
      expectedCount: number;
      message: string;
    }
  | { id: string; kind: 'parameter-present'; parameter: string; message: string }
  | { id: string; kind: 'array-length'; value: ValueExpression; length: number; message: string }
  | { id: string; kind: 'response-window-open'; windowId: ValueExpression; message: string }
  | {
      id: string;
      kind: 'actor-relative-position';
      sourceActor: ValueExpression;
      order: string[];
      offset: number;
      message: string;
    }
  | {
      id: string;
      kind: 'relation-exists';
      source: EntityReferenceExpression;
      target: EntityReferenceExpression;
      relationType: string;
      message: string;
    };

export type EffectDefinition =
  | {
      kind: 'zone.distribute';
      sourceZone: ValueExpression;
      destinationZones: ValueExpression[];
      batchPattern: number[];
    }
  | { kind: 'zone.move-head'; fromZone: ValueExpression; toZone: ValueExpression; metadata?: Record<string, Primitive> }
  | {
      kind: 'zone.move-entity';
      entity: ValueExpression;
      fromZone: ValueExpression;
      toZone: ValueExpression;
      metadata?: Record<string, Primitive>;
    }
  | {
      kind: 'zone.move-entities';
      entities: ValueExpression;
      fromZone: ValueExpression;
      toZone: ValueExpression;
      metadata?: Record<string, Primitive>;
    }
  | {
      kind: 'zone.claim-entity';
      entity: ValueExpression;
      fromZone: ValueExpression;
      toZone: ValueExpression;
      metadata?: Record<string, Primitive>;
    }
  | { kind: 'zone.place-entity'; entity: ValueExpression; zone: ValueExpression; metadata?: Record<string, Primitive> }
  | { kind: 'entity.create'; entityId: ValueExpression; entityKind: string; components: Record<string, unknown> }
  | {
      kind: 'relation.connect';
      relationType: string;
      source: EntityReferenceExpression;
      target: EntityReferenceExpression;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: 'relation.connect-many';
      relationType: string;
      source: EntityReferenceExpression;
      targetKind: string;
      targetIds: ValueExpression;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: 'event.emit';
      eventType: string;
      subjects?: EntityReferenceExpression[];
      objects?: EntityReferenceExpression[];
      payload?: Record<string, ValueExpression | Primitive>;
    }
  | { kind: 'procedure.spawn'; procedureId: string; nodeId?: string; owner: ValueExpression; tokenId?: ValueExpression }
  | { kind: 'procedure.transition'; nodeId: string; tokenId?: ValueExpression }
  | { kind: 'procedure.rotate-owner'; order: string[]; nodeId: string; tokenId?: ValueExpression }
  | { kind: 'procedure.set-owner'; owner: ValueExpression; nodeId: string; tokenId: ValueExpression }
  | {
      kind: 'response-window.open';
      definitionId: string;
      windowId: ValueExpression;
      sourceActor: ValueExpression;
      sourceEvent: ValueExpression;
      sourceEntity: ValueExpression;
      parentTokenId: ValueExpression;
    }
  | { kind: 'response-window.submit'; windowId: ValueExpression };

export interface ActionDefinition {
  id: string;
  parameters: Record<string, ParameterType>;
  requirements: RequirementDefinition[];
  effects: EffectDefinition[];
}

export interface ProcedureNodeDefinition { id: string; onEnter?: EffectDefinition[] }
export interface ProcedureDefinition { id: string; entryNodeId: string; nodes: ProcedureNodeDefinition[] }
export interface BootstrapProcedure { procedureId: string; ownerId: string; tokenId?: string }
export interface InitialEventDefinition {
  id: string;
  type: string;
  subjects?: { kind: string; id: string }[];
  objects?: { kind: string; id: string }[];
  payload?: Record<string, unknown>;
}

export interface ResponsePriorityTier {
  actionIds: string[];
  selection: 'single' | 'all';
  maxSelections?: number;
}

export interface ResponseWindowDefinition {
  id: string;
  allowedActionIds: string[];
  participantOrder: string[];
  excludeSourceActor: boolean;
  tiers: ResponsePriorityTier[];
  noSelectionEffects: EffectDefinition[];
  selectionEffects: Record<string, EffectDefinition[]>;
}

export interface WorldSource {
  schemaVersion: string;
  id: string;
  entities: EntityRecord[];
  zones: ZoneRecord[];
  relations: RelationRecord[];
  actions: ActionDefinition[];
  procedures: ProcedureDefinition[];
  responseWindows?: ResponseWindowDefinition[];
  capabilities?: CapabilityRequirement[];
  bootstrap: BootstrapProcedure[];
  initialEvents?: InitialEventDefinition[];
  metadata?: Record<string, unknown>;
}

export interface WorldImage extends WorldSource { hash: string }
