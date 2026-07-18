import { describe, expect, it } from 'vitest';
import {
  createCoreCapabilityRegistry,
  type ExactCoverInput,
  type NumericPipelineInput,
} from '../src/index.js';

function item(id: string, suit: string, rank: number, face: string) {
  return { id, attributes: { suit, rank, face } };
}

describe('world capability ABI', () => {
  it('expresses three four-entity groups plus a pair without a mahjong-specific hand branch', () => {
    const registry = createCoreCapabilityRegistry();
    const input: ExactCoverInput = {
      items: [
        item('m1', 'm', 1, 'm1'), item('m2', 'm', 2, 'm2'), item('m3', 'm', 3, 'm3'), item('m4', 'm', 4, 'm4'),
        item('p1a', 'p', 1, 'p1'), item('p1b', 'p', 1, 'p1'), item('p1c', 'p', 1, 'p1'), item('p1d', 'p', 1, 'p1'),
        item('s5', 's', 5, 's5'), item('s6', 's', 6, 's6'), item('s7', 's', 7, 's7'), item('s8', 's', 8, 's8'),
        item('east-a', 'z', 1, 'z1'), item('east-b', 'z', 1, 'z1'),
      ],
      slots: [
        {
          id: 'four-entity-group',
          count: 3,
          alternatives: [
            {
              id: 'same-suit-consecutive-four',
              size: 4,
              predicates: [
                { kind: 'all-equal', path: 'suit' },
                { kind: 'consecutive', path: 'rank' },
              ],
            },
            {
              id: 'four-equal-faces',
              size: 4,
              predicates: [{ kind: 'all-equal', path: 'face' }],
            },
          ],
        },
        {
          id: 'pair',
          count: 1,
          alternatives: [{ id: 'two-equal-faces', size: 2, predicates: [{ kind: 'all-equal', path: 'face' }] }],
        },
      ],
      maxSolutions: 1,
    };

    const result = registry.invoke<ExactCoverInput, { matched: boolean; solutions: Array<Array<{ itemIds: string[] }>> }>(
      'core.partition.exact-cover',
      input,
    );
    expect(result.matched).toBe(true);
    expect(result.solutions[0]).toHaveLength(4);
    expect(result.solutions[0].flatMap((group) => group.itemIds).sort()).toEqual(input.items.map((entry) => entry.id).sort());
  });

  it('handles signed contributions and a threshold at an explicit later stage', () => {
    const registry = createCoreCapabilityRegistry();
    const passing: NumericPipelineInput = {
      stageOrder: ['base', 'tile-contributions', 'qualification'],
      contributions: [
        { stage: 'base', dimension: 'han', operation: 'add', value: 2 },
        { stage: 'tile-contributions', dimension: 'han', operation: 'add', value: -1 },
      ],
      constraints: [
        { afterStage: 'qualification', dimension: 'han', comparison: 'gte', value: 1, code: 'minimum-han' },
      ],
    };
    const pass = registry.invoke<NumericPipelineInput, { valid: boolean; dimensions: Record<string, number>; failures: string[] }>(
      'core.numeric.pipeline',
      passing,
    );
    expect(pass.dimensions.han).toBe(1);
    expect(pass.valid).toBe(true);

    const fail = registry.invoke<NumericPipelineInput, { valid: boolean; dimensions: Record<string, number>; failures: string[] }>(
      'core.numeric.pipeline',
      {
        ...passing,
        contributions: [
          { stage: 'base', dimension: 'han', operation: 'add', value: 1 },
          { stage: 'tile-contributions', dimension: 'han', operation: 'add', value: -2 },
        ],
      },
    );
    expect(fail.dimensions.han).toBe(-1);
    expect(fail.valid).toBe(false);
    expect(fail.failures).toContain('minimum-han');
  });

  it('pins descriptor hashes and exposes the same catalog as MCP-shaped tools and resources', () => {
    const registry = createCoreCapabilityRegistry();
    const requirements = registry.requirements(['core.partition.exact-cover', 'core.numeric.pipeline']);
    expect(() => registry.verify(requirements)).not.toThrow();
    expect(() => registry.verify([{ ...requirements[0], descriptorHash: 'wrong' }])).toThrow(/descriptor mismatch/i);

    const catalog = registry.toMcpCatalog();
    expect(catalog.tools).toHaveLength(2);
    expect(catalog.tools.every((tool) => tool.inputSchema && tool.outputSchema)).toBe(true);
    expect(catalog.resources.every((resource) => resource.uri.startsWith('mahjongplus://capabilities/'))).toBe(true);
  });
});
