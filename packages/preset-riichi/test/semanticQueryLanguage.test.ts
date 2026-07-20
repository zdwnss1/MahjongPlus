import { describe, expect, it } from 'vitest';
import {
  compileTransactionalFactActionModule,
  compileWorld,
  instantiateRuleModule,
  type SemanticBindingProfile,
  type SemanticQueryDefinition,
  type WorldSource,
} from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';

const rule: SemanticQueryDefinition = {
  where: {
    kind: 'all',
    values: [
      {
        kind: 'exists',
        bind: 'call',
        domain: 'event',
        collection: { kind: 'context', field: 'events' },
        eventClass: 'call-committed',
        where: {
          kind: 'all',
          values: [
            {
              kind: 'compare',
              operator: 'eq',
              left: { kind: 'binding', binding: 'call', domain: 'event', field: 'actor' },
              right: { kind: 'context', field: 'actor' },
            },
            {
              kind: 'compare',
              operator: 'eq',
              left: { kind: 'binding', binding: 'call', domain: 'event', field: 'call-kind' },
              right: { kind: 'literal', value: 'pon' },
            },
          ],
        },
      },
      {
        kind: 'exists',
        bind: 'piece',
        domain: 'entity',
        collection: { kind: 'world', field: 'entities' },
        where: {
          kind: 'all',
          values: [
            {
              kind: 'compare',
              operator: 'eq',
              left: { kind: 'binding', binding: 'piece', domain: 'entity', field: 'id' },
              right: { kind: 'literal', value: 'piece:1' },
            },
            {
              kind: 'compare',
              operator: 'eq',
              left: { kind: 'binding', binding: 'piece', domain: 'entity', field: 'face' },
              right: { kind: 'literal', value: 'm1' },
            },
          ],
        },
      },
      {
        kind: 'position',
        entity: { kind: 'literal', value: 'piece:1' },
        zoneKind: { kind: 'literal', value: 'reserve' },
        state: { kind: 'literal', value: 'occupied' },
        ordinal: { operator: 'eq', value: { kind: 'literal', value: 0 } },
      },
    ],
  },
};

const commonContext = {
  actor: ['actorId'],
  revision: ['revision'],
  'action-entity': ['actionEntityId'],
  params: ['params'],
  world: ['world'],
  events: ['events'],
};

const profileA: SemanticBindingProfile = {
  id: 'test.binding-profile.a',
  version: '1.0.0',
  fields: {
    context: commonContext,
    event: {
      type: ['type'],
      actor: ['subjects', '0', 'id'],
      revision: ['revision'],
      'call-kind': ['payload', 'actionKind'],
    },
    entity: {
      id: ['id'],
      kind: ['kind'],
      face: ['components', 'tile', 'baseFace'],
    },
    zone: {
      id: ['id'],
      kind: ['metadata', 'semanticKind'],
      entries: ['entries'],
    },
    'zone-entry': {
      'entity-id': ['entityId'],
      state: ['state'],
      ordinal: ['ordinal'],
    },
  },
  eventClasses: { 'call-committed': ['group.finalized'] },
};

const profileB: SemanticBindingProfile = {
  id: 'test.binding-profile.b',
  version: '1.0.0',
  fields: {
    context: commonContext,
    event: {
      type: ['type'],
      actor: ['subjects', '0', 'id'],
      revision: ['revision'],
      'call-kind': ['payload', 'callVariant'],
    },
    entity: {
      id: ['id'],
      kind: ['kind'],
      face: ['components', 'identity', 'symbol'],
    },
    zone: {
      id: ['id'],
      kind: ['metadata', 'role'],
      entries: ['entries'],
    },
    'zone-entry': {
      'entity-id': ['entityId'],
      state: ['state'],
      ordinal: ['ordinal'],
    },
  },
  eventClasses: { 'call-committed': ['call.bound.v2'] },
};

function worldFor(profile: 'a' | 'b', callKind = 'pon'): WorldSource {
  const alternate = profile === 'b';
  return {
    schemaVersion: 'mwl/0.9',
    id: `fixture:semantic-bindings:${profile}`,
    entities: [
      { id: 'east', kind: 'player', components: {} },
      alternate
        ? { id: 'piece:1', kind: 'tile', components: { identity: { symbol: 'm1' } } }
        : { id: 'piece:1', kind: 'tile', components: { tile: { baseFace: 'm1' } } },
    ],
    zones: [{
      id: 'zone:1',
      kind: 'opaque-host-kind',
      ordered: true,
      entries: [{
        slotId: 'zone:1:slot:0',
        entityId: 'piece:1',
        ordinal: 0,
        state: 'occupied',
        metadata: {},
      }],
      metadata: alternate ? { role: 'reserve' } : { semanticKind: 'reserve' },
    }],
    relations: [],
    actions: [{ id: 'probe', parameters: {}, requirements: [], effects: [] }],
    procedures: [],
    responseWindows: [],
    corePrograms: { constraints: [], reducers: [], rewrites: [] },
    bootstrap: [],
    initialEvents: [{
      id: 'event:call',
      type: alternate ? 'call.bound.v2' : 'group.finalized',
      subjects: [{ kind: 'player', id: 'east' }],
      payload: alternate ? { callVariant: callKind } : { actionKind: callKind },
    }],
  };
}

function result(profile: SemanticBindingProfile, world: WorldSource) {
  const module = compileTransactionalFactActionModule({
    id: `test.semantic-gate.${profile.id}`,
    version: '1.0.0',
    semanticProfile: profile,
    gates: [{
      id: 'probe.semantic-gate',
      actionId: 'probe',
      message: 'The semantic event, attribute, and position bindings do not match.',
      allow: rule,
    }],
  });
  const runtime = new WorldRuntime(compileWorld(instantiateRuleModule(world, { definition: module }).world));
  return runtime.attempt({
    attemptId: 'probe',
    actorId: 'east',
    actionId: 'probe',
    observedRevision: 0,
    parameters: {},
  });
}

describe('semantic binding profiles', () => {
  it('runs one unchanged semantic rule over two event, property, and zone schemas', () => {
    expect(result(profileA, worldFor('a')).outcome).toBe('executed');
    expect(result(profileB, worldFor('b')).outcome).toBe('executed');
  });

  it('rejects when the remapped semantic event property does not match', () => {
    expect(result(profileB, worldFor('b', 'chi')).outcome).toBe('rejected');
  });
});
