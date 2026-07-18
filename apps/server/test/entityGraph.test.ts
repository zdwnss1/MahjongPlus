import { describe, expect, it } from 'vitest';
import { AttachmentRegistry } from '../src/kernel/attachments.js';
import { EntityRelationGraph } from '../src/kernel/entityGraph.js';

describe('entity relation graph and attachments', () => {
  it('binds a tile to an action and activates a tile attachment through the causing action', () => {
    const graph = new EntityRelationGraph();
    const tile = { kind: 'tile' as const, id: 'tile-1' };
    const action = { kind: 'action' as const, id: 'action-1' };
    graph.connect({ type: 'targets', source: action, target: tile });

    const registry = new AttachmentRegistry();
    registry.attach({
      id: 'binding-1',
      host: tile,
      eventTypes: ['discard.committed'],
      match: 'causing-action-targets-host',
      effects: [{ type: 'han.delta', payload: { amount: -1 } }],
      lifetime: { kind: 'charges', remaining: 1 },
      visibility: 'public',
      sourceRuleId: 'rule-1',
      enabled: true,
    });

    const matching = registry.matching({
      id: 'event-1',
      type: 'discard.committed',
      subjects: [],
      objects: [],
      causedBy: action,
    }, graph);
    expect(matching.map((binding) => binding.id)).toEqual(['binding-1']);
    registry.consume('binding-1');
    expect(registry.snapshot()).toHaveLength(0);
  });
});
