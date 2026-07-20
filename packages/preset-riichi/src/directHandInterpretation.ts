import {
  compileTrackedSourcePartitionInterpretationModule,
  type RuleModuleDefinition,
  type TrackedSourcePartitionInterpretationDefinition,
} from '@mahjongplus/world-language';
import { RIICHI_HAND_STRUCTURE_PROFILES } from './handStructureProfiles.js';

export const RIICHI_DIRECT_INTERPRETATION_DEFINITION: TrackedSourcePartitionInterpretationDefinition = {
  id: 'service.riichi-direct-hand-interpretation',
  version: '1.0.0',
  title: 'Riichi direct-source hand interpretation',
  profiles: RIICHI_HAND_STRUCTURE_PROFILES,
  actionId: 'interpretation.submit-direct',
  trackId: 'track:direct-hand-interpretations',
  eventType: 'hand-interpretation.accepted',
  sourceDefinitionId: 'interpretation-source.direct-draw',
  sourceEntityKind: 'interpretation-source',
  sourceMode: 'direct',
  movementEventType: 'entity.moved',
  movementFromZonePayloadPath: ['payload', 'fromZone'],
  movementEntityPath: ['subjects', '0', 'id'],
};

const compiledDirectInterpretation = compileTrackedSourcePartitionInterpretationModule(
  RIICHI_DIRECT_INTERPRETATION_DEFINITION,
);

export const RIICHI_DIRECT_INTERPRETATION_MODULE: RuleModuleDefinition = {
  ...compiledDirectInterpretation,
  metadata: {
    ...compiledDirectInterpretation.metadata,
    integrationStatus: 'partial',
    grantsScore: false,
    grantsWinSettlement: false,
    bindingSelectors: {
      playerIds: { type: 'entity-id', entityKind: 'player', cardinality: 'many' },
      subjectZones: {
        type: 'literal',
        value: [
          { subjectId: 'east', zoneId: 'hand:east' },
          { subjectId: 'south', zoneId: 'hand:south' },
          { subjectId: 'west', zoneId: 'hand:west' },
          { subjectId: 'north', zoneId: 'hand:north' },
        ],
      },
      sourceZoneIds: { type: 'literal', value: ['wall.live', 'wall.dead'] },
      drawActionId: { type: 'action-id', id: 'draw' },
      evidenceRelationType: { type: 'literal', value: 'has-partition-shape' },
    },
  },
};
