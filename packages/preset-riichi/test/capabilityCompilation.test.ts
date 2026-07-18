import { describe, expect, it } from 'vitest';
import { createCoreCapabilityRegistry } from '@mahjongplus/world-capabilities';
import { compileWorld, type WorldSource } from '@mahjongplus/world-language';
import { createRiichiWorldSource } from '../src/preset.js';

function sourceWithCapability(): { source: WorldSource; registry: ReturnType<typeof createCoreCapabilityRegistry> } {
  const registry = createCoreCapabilityRegistry();
  const source = createRiichiWorldSource({ seed: 'capability-compile' });
  source.capabilities = registry.requirements(['core.partition.exact-cover']);
  source.actions.push({
    id: 'inspect-arbitrary-partition',
    parameters: {},
    requirements: [],
    effects: [{
      kind: 'event.emit',
      eventType: 'partition.inspected',
      payload: {
        result: {
          kind: 'capability-call',
          capabilityId: 'core.partition.exact-cover',
          input: { items: [], slots: [], maxSolutions: 1 },
        },
      },
    }],
  });
  return { source, registry };
}

describe('world capability compilation', () => {
  it('pins a capability descriptor into the world image hash', () => {
    const { source, registry } = sourceWithCapability();
    const image = compileWorld(source, { capabilityCatalog: registry.catalog() });
    expect(image.capabilities).toEqual(source.capabilities);
    expect(image.hash).toHaveLength(16);
  });

  it('rejects undeclared calls, missing catalogs and descriptor drift', () => {
    const { source, registry } = sourceWithCapability();
    expect(() => compileWorld(source)).toThrow(/catalog/i);

    const undeclared = structuredClone(source);
    undeclared.capabilities = [];
    expect(() => compileWorld(undeclared, { capabilityCatalog: registry.catalog() })).toThrow(/not declared/i);

    const drifted = structuredClone(source);
    drifted.capabilities![0].descriptorHash = 'drifted';
    expect(() => compileWorld(drifted, { capabilityCatalog: registry.catalog() })).toThrow(/descriptor mismatch/i);
  });
});
