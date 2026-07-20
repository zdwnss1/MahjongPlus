import type { SemanticBindingProfile } from '@mahjongplus/world-language';

/**
 * Maps domain-neutral semantic names to the current riichi event/world schema.
 * Rule data refers only to these semantic names. A variant may replace the
 * profile without rewriting rule predicates.
 */
export const RIICHI_SEMANTIC_BINDING_PROFILE: SemanticBindingProfile = {
  id: 'profile.riichi-semantic-bindings',
  version: '1.0.0',
  fields: {
    context: {
      actor: ['actorId'],
      revision: ['revision'],
      'action-entity': ['actionEntityId'],
      params: ['params'],
      world: ['world'],
      events: ['events'],
      tiles: ['tiles'],
      closed: ['closed'],
      wait: ['wait'],
      'source-mode': ['source', 'mode'],
      'source-exposure': ['source', 'exposureId'],
      'source-entity': ['sourceEntityId'],
    },
    event: {
      id: ['id'],
      type: ['type'],
      actor: ['actorId'],
      revision: ['revision'],
      'cause-action': ['causedByActionId'],
      'declaration-kind': ['payload', 'declarationType'],
      'discard-event': ['payload', 'discardEventId'],
      'call-kind': ['payload', 'callType'],
    },
    tile: {
      id: ['id'],
      face: ['face'],
      suit: ['suit'],
      rank: ['rank'],
      numeric: ['numeric'],
      'terminal-or-honor': ['terminalOrHonor'],
      entity: ['entity'],
    },
    entity: {
      id: ['id'],
      kind: ['kind'],
      'riichi-eligible': ['components', 'riichi', 'eligible'],
      'fact-records': ['components', 'factTrack', 'records'],
    },
    zone: {
      id: ['id'],
      kind: ['kind'],
      entries: ['entries'],
    },
    'zone-entry': {
      'entity-id': ['entityId'],
      ordinal: ['ordinal'],
      state: ['state'],
    },
    relation: {
      type: ['type'],
      'source-kind': ['source', 'kind'],
      'source-id': ['source', 'id'],
      'target-kind': ['target', 'kind'],
      'target-id': ['target', 'id'],
    },
    record: {
      'subject-id': ['subjectId'],
      state: ['state'],
      'allowed-modes': ['allowedModes'],
      'declaration-kind': ['declarationType'],
    },
    token: {
      'procedure-id': ['procedureId'],
      'node-id': ['nodeId'],
      owner: ['ownerId'],
    },
  },
  eventClasses: {
    'declaration-published': ['declaration.published'],
    'meld-committed': ['meld.committed'],
    'call-committed': ['meld.committed', 'kan.committed'],
    'tile-drawn': ['tile.drawn'],
    'tile-discarded': ['tile.discarded'],
  },
  eventPayloadFields: {
    'declaration-kind': 'declarationType',
    'wait-evidence': 'waitEvidenceId',
    'wait-form': 'waitForm',
    'call-kind': 'callType',
    'discard-event': 'discardEventId',
  },
};
