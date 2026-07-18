export type CapabilityKind = 'query' | 'constraint' | 'reducer' | 'generator';
export type CapabilityPurity = 'pure' | 'transactional';
export type JsonSchema = Record<string, unknown>;

export interface CapabilityBudget {
  maxSteps: number;
  maxOutputBytes: number;
}

export interface CapabilityDescriptor {
  id: string;
  version: string;
  kind: CapabilityKind;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  deterministic: true;
  purity: CapabilityPurity;
  reads: string[];
  writes: string[];
  budget: CapabilityBudget;
}

export interface CapabilityRequirement {
  id: string;
  version: string;
  descriptorHash: string;
}

export interface CapabilityCall {
  capabilityId: string;
  input: unknown;
}

export interface CapabilityInvocationContext {
  actorId?: string;
  revision?: number;
  world?: {
    readEntity?: (entityId: string) => unknown;
    readEntityPath?: (entityId: string, path: string) => unknown;
    zoneEntityIds?: (zoneId: string) => string[];
    outgoingRelations?: (source: { kind: string; id: string }, type?: string) => unknown[];
  };
}

export interface CapabilityImplementation<I = unknown, O = unknown> {
  descriptor: CapabilityDescriptor;
  invoke(input: I, context: CapabilityInvocationContext): O;
}

export interface CapabilityCatalogEntry {
  descriptor: CapabilityDescriptor;
  descriptorHash: string;
}

export interface CapabilityCatalogSnapshot {
  entries: CapabilityCatalogEntry[];
}

export interface McpToolDescriptor {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
    capabilityId: string;
    capabilityVersion: string;
    descriptorHash: string;
  };
}

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: 'application/json';
}

export interface McpCapabilityCatalog {
  tools: McpToolDescriptor[];
  resources: McpResourceDescriptor[];
}
