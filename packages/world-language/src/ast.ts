import type { EntityRecord, RelationRecord, ZoneRecord } from '@mahjongplus/world-model';

export type Primitive = string | number | boolean | null;

export type ValueExpression =
  | { kind: 'literal'; value: unknown }
  | { kind: 'context'; path: string }
  | { kind: 'template'; template: string }
  | { kind: 'last-moved-entity' };

export type RequirementDefinition =
  | {
      id: string;
      kind: 'procedure-token';
      procedureId: string;
      nodeId: string;
      owner: 'actor' | { value: ValueExpression };
      message: string;
    }
  | {
      id: string;
      kind: 'zone-not-empty';
      zone: ValueExpression;
      message: string;
    }
  | {
      id: string;
      kind: 'entity-in-zone';
      entity: ValueExpression;
      zone: ValueExpression;
      message: string;
    }
  | {
      id: string;
      kind: 'parameter-present';
      parameter: string;
      message: string;
    };

export type EntityReferenceExpression =
  | { kind: 'entity'; entityKind: string; id: ValueExpression }
  | { kind: 'actor' }
  | { kind: 'last-moved-entity'; entityKind?: string };

export type EffectDefinition =
  | {
      kind: 'zone.distribute';
      sourceZone: ValueExpression;
      destinationZones: ValueExpression[];
      batchPattern: number[];
    }
  | {
      kind: 'zone.move-head';
      fromZone: ValueExpression;
      toZone: ValueExpression;
      metadata?: Record<string, Primitive>;
    }
  | {
      kind: 'zone.move-entity';
      entity: ValueExpression;
      fromZone: ValueExpression;
      toZone: ValueExpression;
      metadata?: Record<string, Primitive>;
    }
  | {
      kind: 'event.emit';
      eventType: string;
      subjects?: EntityReferenceExpression[];
      objects?: EntityReferenceExpression[];
      payload?: Record<string, ValueExpression | Primitive>;
    }
  | {
      kind: 'procedure.spawn';
      procedureId: string;
      nodeId?: string;
      owner: ValueExpression;
      tokenId?: ValueExpression;
    }
  | {
      kind: 'procedure.transition';
      nodeId: string;
    }
  | {
      kind: 'procedure.rotate-owner';
      order: string[];
      nodeId: string;
    };

export interface ActionDefinition {
  id: string;
  parameters: Record<string, 'string' | 'number' | 'boolean'>;
  requirements: RequirementDefinition[];
  effects: EffectDefinition[];
}

export interface ProcedureNodeDefinition {
  id: string;
  onEnter?: EffectDefinition[];
}

export interface ProcedureDefinition {
  id: string;
  entryNodeId: string;
  nodes: ProcedureNodeDefinition[];
}

export interface BootstrapProcedure {
  procedureId: string;
  ownerId: string;
  tokenId?: string;
}

export interface InitialEventDefinition {
  id: string;
  type: string;
  subjects?: { kind: string; id: string }[];
  objects?: { kind: string; id: string }[];
  payload?: Record<string, unknown>;
}

export interface WorldSource {
  schemaVersion: string;
  id: string;
  entities: EntityRecord[];
  zones: ZoneRecord[];
  relations: RelationRecord[];
  actions: ActionDefinition[];
  procedures: ProcedureDefinition[];
  bootstrap: BootstrapProcedure[];
  initialEvents?: InitialEventDefinition[];
  metadata?: Record<string, unknown>;
}

export interface WorldImage extends WorldSource {
  hash: string;
}
