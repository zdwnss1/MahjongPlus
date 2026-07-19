import {
  analyzeRuleModuleDefinition,
  withRuleModuleBindingSelectors,
  type RuleModuleBindingSelectors,
  type RuleModuleDefinition,
} from '@mahjongplus/world-language';
import { RIICHI_RESPONSE_INTERPRETATION_MODULE } from './handStructureProfiles.js';
import { LOCAL_YAKU_MODULES } from './localYaku.js';
import { RIICHI_COMMON_FLOW_MODULE } from './riichiCommonFlowModule.js';
import { SUPER_RIICHI_MODULE } from './superRiichiModule.js';
import {
  CONTINUING_WIN_FLOW_MODULE,
  TURBO_DECLARATION_MODULE,
} from './turboRiichiModules.js';

export const RIICHI_MODULE_BINDING_SELECTORS: Record<string, RuleModuleBindingSelectors> = {
  [RIICHI_COMMON_FLOW_MODULE.id]: {
    playerIds: { kind: 'entity-id', entityKind: 'player', cardinality: 'many' },
    dealerId: { kind: 'world-metadata', path: 'dealer' },
    liveZoneId: { kind: 'zone-id', zoneKind: 'wall-live' },
  },
  [SUPER_RIICHI_MODULE.id]: {
    ledgerId: { kind: 'entity-id', entityKind: 'resource-ledger', component: 'ledger' },
    liveZoneId: { kind: 'zone-id', zoneKind: 'wall-live' },
    deadZoneId: { kind: 'zone-id', zoneKind: 'wall-dead' },
    indicatorCandidates: {
      kind: 'derived',
      operation: 'zone-entry-candidates',
      sourceBinding: 'deadZoneId',
      stride: 2,
      ordinal: 'sequence',
    },
  },
  [TURBO_DECLARATION_MODULE.id]: {
    ledgerId: { kind: 'entity-id', entityKind: 'resource-ledger', component: 'ledger' },
    playerIds: { kind: 'entity-id', entityKind: 'player', cardinality: 'many' },
    turnProcedureId: { kind: 'procedure-id', id: 'turn' },
    awaitDiscardNodeId: {
      kind: 'procedure-node-id',
      procedureBinding: 'turnProcedureId',
      nodeId: 'await-discard',
    },
  },
  [CONTINUING_WIN_FLOW_MODULE.id]: {
    playerIds: { kind: 'entity-id', entityKind: 'player', cardinality: 'many' },
    turnPairs: {
      kind: 'derived',
      operation: 'cycle-pairs',
      sourceBinding: 'playerIds',
    },
    initialDraws: {
      kind: 'derived',
      operation: 'null-records',
      sourceBinding: 'playerIds',
      idField: 'subjectId',
      nullFields: ['tileId', 'exposureId'],
    },
    liveZoneId: { kind: 'zone-id', zoneKind: 'wall-live' },
    canWinRelationType: { kind: 'relation-type', value: 'can-win-on' },
    turnProcedureId: { kind: 'procedure-id', id: 'turn' },
    awaitDrawNodeId: {
      kind: 'procedure-node-id',
      procedureBinding: 'turnProcedureId',
      nodeId: 'await-draw',
    },
    awaitDiscardNodeId: {
      kind: 'procedure-node-id',
      procedureBinding: 'turnProcedureId',
      nodeId: 'await-discard',
    },
    drawActionId: { kind: 'action-id', id: 'draw' },
    discardActionId: { kind: 'action-id', id: 'discard' },
    endActionId: { kind: 'action-id', id: 'end-exhaustive-draw' },
    discardPolicyTrackId: {
      kind: 'entity-id',
      id: 'track:discard-policies',
      component: 'discardPolicies',
    },
  },
  [RIICHI_RESPONSE_INTERPRETATION_MODULE.id]: {
    subjectZones: {
      kind: 'literal',
      value: [
        { subjectId: 'east', zoneId: 'hand:east' },
        { subjectId: 'south', zoneId: 'hand:south' },
        { subjectId: 'west', zoneId: 'hand:west' },
        { subjectId: 'north', zoneId: 'hand:north' },
      ],
    },
    evidenceRelationType: { kind: 'relation-type', value: 'can-win-on' },
  },
};

function catalogModule(definition: RuleModuleDefinition): RuleModuleDefinition {
  const selectors = RIICHI_MODULE_BINDING_SELECTORS[definition.id];
  return selectors ? withRuleModuleBindingSelectors(definition, selectors) : structuredClone(definition);
}

export const RIICHI_RULE_MODULES: RuleModuleDefinition[] = [
  RIICHI_COMMON_FLOW_MODULE,
  ...LOCAL_YAKU_MODULES,
  SUPER_RIICHI_MODULE,
  TURBO_DECLARATION_MODULE,
  CONTINUING_WIN_FLOW_MODULE,
  RIICHI_RESPONSE_INTERPRETATION_MODULE,
].map(catalogModule);

export const RIICHI_RULE_MODULE_ANALYSES = RIICHI_RULE_MODULES.map((definition) =>
  analyzeRuleModuleDefinition(definition));
