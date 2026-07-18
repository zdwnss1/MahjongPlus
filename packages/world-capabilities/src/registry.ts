import { stableHash } from './canonical.js';
import type {
  CapabilityCatalogSnapshot,
  CapabilityDescriptor,
  CapabilityImplementation,
  CapabilityInvocationContext,
  CapabilityRequirement,
  McpCapabilityCatalog,
} from './types.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validateDescriptor(descriptor: CapabilityDescriptor): void {
  if (!descriptor.id || !descriptor.version) throw new Error('Capability id and version are required.');
  if (!descriptor.title || !descriptor.description) throw new Error(`Capability ${descriptor.id} needs title and description.`);
  if (descriptor.deterministic !== true) throw new Error(`Capability ${descriptor.id} must be deterministic.`);
  if (!Number.isInteger(descriptor.budget.maxSteps) || descriptor.budget.maxSteps < 1) {
    throw new Error(`Capability ${descriptor.id} needs a positive maxSteps budget.`);
  }
  if (!Number.isInteger(descriptor.budget.maxOutputBytes) || descriptor.budget.maxOutputBytes < 1) {
    throw new Error(`Capability ${descriptor.id} needs a positive maxOutputBytes budget.`);
  }
  if (descriptor.purity === 'pure' && descriptor.writes.length > 0) {
    throw new Error(`Pure capability ${descriptor.id} cannot declare writes.`);
  }
}

export function descriptorHash(descriptor: CapabilityDescriptor): string {
  return stableHash(descriptor);
}

export function verifyCapabilityRequirements(
  requirements: readonly CapabilityRequirement[],
  catalog: CapabilityCatalogSnapshot,
): void {
  const entries = new Map(catalog.entries.map((entry) => [`${entry.descriptor.id}@${entry.descriptor.version}`, entry]));
  for (const requirement of requirements) {
    const entry = entries.get(`${requirement.id}@${requirement.version}`);
    if (!entry) throw new Error(`Missing capability ${requirement.id}@${requirement.version}.`);
    if (entry.descriptorHash !== requirement.descriptorHash) {
      throw new Error(`Capability descriptor mismatch for ${requirement.id}@${requirement.version}.`);
    }
  }
}

export class CapabilityRegistry {
  private readonly implementations = new Map<string, CapabilityImplementation>();

  register(implementation: CapabilityImplementation): this {
    validateDescriptor(implementation.descriptor);
    const key = `${implementation.descriptor.id}@${implementation.descriptor.version}`;
    if (this.implementations.has(key)) throw new Error(`Duplicate capability ${key}.`);
    this.implementations.set(key, implementation);
    return this;
  }

  descriptor(id: string, version?: string): CapabilityDescriptor {
    return clone(this.require(id, version).descriptor);
  }

  catalog(): CapabilityCatalogSnapshot {
    return {
      entries: [...this.implementations.values()]
        .map((implementation) => ({
          descriptor: clone(implementation.descriptor),
          descriptorHash: descriptorHash(implementation.descriptor),
        }))
        .sort((left, right) => `${left.descriptor.id}@${left.descriptor.version}`
          .localeCompare(`${right.descriptor.id}@${right.descriptor.version}`)),
    };
  }

  requirements(ids: readonly string[]): CapabilityRequirement[] {
    return ids.map((id) => {
      const implementation = this.require(id);
      return {
        id: implementation.descriptor.id,
        version: implementation.descriptor.version,
        descriptorHash: descriptorHash(implementation.descriptor),
      };
    }).sort((left, right) => left.id.localeCompare(right.id));
  }

  verify(requirements: readonly CapabilityRequirement[]): void {
    verifyCapabilityRequirements(requirements, this.catalog());
  }

  invoke<I = unknown, O = unknown>(
    id: string,
    input: I,
    context: CapabilityInvocationContext = {},
    version?: string,
  ): O {
    const implementation = this.require(id, version) as CapabilityImplementation<I, O>;
    const output = implementation.invoke(clone(input), context);
    const serialized = JSON.stringify(output);
    if (serialized === undefined) throw new Error(`Capability ${id} returned a non-serializable result.`);
    if (new TextEncoder().encode(serialized).length > implementation.descriptor.budget.maxOutputBytes) {
      throw new Error(`Capability ${id} exceeded its output budget.`);
    }
    return clone(output);
  }

  toMcpCatalog(): McpCapabilityCatalog {
    const entries = this.catalog().entries;
    return {
      tools: entries.map((entry) => ({
        name: `${entry.descriptor.id.replace(/[^A-Za-z0-9_-]/g, '_')}__${entry.descriptor.version.replace(/[^A-Za-z0-9_-]/g, '_')}`,
        title: entry.descriptor.title,
        description: entry.descriptor.description,
        inputSchema: clone(entry.descriptor.inputSchema),
        outputSchema: clone(entry.descriptor.outputSchema),
        annotations: {
          readOnlyHint: entry.descriptor.purity === 'pure',
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          capabilityId: entry.descriptor.id,
          capabilityVersion: entry.descriptor.version,
          descriptorHash: entry.descriptorHash,
        },
      })),
      resources: entries.map((entry) => ({
        uri: `mahjongplus://capabilities/${encodeURIComponent(entry.descriptor.id)}/${encodeURIComponent(entry.descriptor.version)}`,
        name: `${entry.descriptor.id}@${entry.descriptor.version}`,
        description: `Frozen descriptor for ${entry.descriptor.title}.`,
        mimeType: 'application/json' as const,
      })),
    };
  }

  private require(id: string, version?: string): CapabilityImplementation {
    if (version) {
      const exact = this.implementations.get(`${id}@${version}`);
      if (!exact) throw new Error(`Unknown capability ${id}@${version}.`);
      return exact;
    }
    const matches = [...this.implementations.values()].filter((entry) => entry.descriptor.id === id);
    if (matches.length !== 1) {
      throw new Error(matches.length === 0 ? `Unknown capability ${id}.` : `Capability ${id} requires an explicit version.`);
    }
    return matches[0];
  }
}
