import { describe, expect, it } from 'vitest';
import { compileWorld } from '@mahjongplus/world-language';
import { createRiichiWorldSource } from '../src/preset.js';

const threshold = (minimum: number) => ({
  id: 'constraint:minimum',
  variables: [],
  constraints: [{
    kind: 'compare' as const,
    operator: 'gte' as const,
    left: { kind: 'literal' as const, value: 1 },
    right: { kind: 'literal' as const, value: minimum },
  }],
});

describe('world image core programs', () => {
  it('freezes core constraints, reducers and rewrites into the world hash', () => {
    const source = createRiichiWorldSource({ seed: 'core-programs' });
    source.corePrograms = {
      constraints: [threshold(1)],
      reducers: [{
        id: 'reducer:count',
        initialState: { count: 0 },
        transitions: [],
      }],
      rewrites: [{
        id: 'rewrite:noop',
        operations: [],
      }],
    };
    const first = compileWorld(source);
    const changed = structuredClone(source);
    changed.corePrograms!.constraints = [threshold(2)];
    const second = compileWorld(changed);

    expect(first.corePrograms?.constraints).toHaveLength(1);
    expect(first.corePrograms?.reducers).toHaveLength(1);
    expect(first.corePrograms?.rewrites).toHaveLength(1);
    expect(first.hash).not.toBe(second.hash);
  });

  it('rejects duplicate core program ids before a match starts', () => {
    const source = createRiichiWorldSource({ seed: 'duplicate-core-program' });
    source.corePrograms = {
      constraints: [threshold(1), threshold(1)],
    };
    expect(() => compileWorld(source)).toThrow(/Duplicate core constraint program id/);
  });
});
