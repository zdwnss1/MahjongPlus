import {
  RIICHI_SEMANTIC_CATALOG as BASE_RIICHI_SEMANTIC_CATALOG,
  type RiichiSemanticCatalog,
  type SemanticBackendRecord,
  type SemanticGapRecord,
  type SemanticImplementationStatus,
  type SemanticModuleRecord,
  type SemanticProfileRecord,
  type SemanticServiceRecord,
} from './semanticCatalog.js';

export type {
  RiichiSemanticCatalog,
  SemanticBackendRecord,
  SemanticGapRecord,
  SemanticImplementationStatus,
  SemanticModuleRecord,
  SemanticProfileRecord,
  SemanticServiceRecord,
} from './semanticCatalog.js';

const RESPONSE_INTERPRETATION_ID = 'service.riichi-response-hand-interpretation';
const DIRECT_INTERPRETATION_ID = 'service.riichi-direct-hand-interpretation';
const RESPONSE_FIXED_ID = 'service.riichi-response-fixed-meld-context';
const DIRECT_FIXED_ID = 'service.riichi-direct-fixed-meld-context';
const RESPONSE_WAIT_ID = 'service.riichi-response-wait-classification';
const DIRECT_WAIT_ID = 'service.riichi-direct-wait-classification';
const INTERPRETATION_SERVICE_ID = 'service.finite-partition-interpretation';
const FIXED_GROUP_SERVICE_ID = 'service.related-fixed-group-context';
const WAIT_SERVICE_ID = 'service.source-group-classification';

const moduleNotes: Record<string, Pick<SemanticModuleRecord, 'status' | 'layer' | 'integrationNotes'>> = {
  [RESPONSE_INTERPRETATION_ID]: {
    status: 'partial',
    layer: 'win-interpretation',
    integrationNotes: [
      'Response proposals are revalidated against the current physical hand zone and response source entity.',
      'Accepted proposals create durable interpretation facts and temporary can-win-on compatibility evidence.',
    ],
  },
  [DIRECT_INTERPRETATION_ID]: {
    status: 'partial',
    layer: 'win-interpretation',
    integrationNotes: [
      'The latest directly acquired physical source is tracked per subject without creating an open response window.',
      'Accepted proposals use the same authoritative finite-partition grammar as response interpretations.',
    ],
  },
  [RESPONSE_FIXED_ID]: {
    status: 'partial',
    layer: 'win-interpretation-context',
    integrationNotes: [
      'Existing response-side pon, chi and open-kan entities are validated through physical contains relations.',
      'Fixed groups remain atomic and are recorded beside the accepted concealed partition.',
    ],
  },
  [DIRECT_FIXED_ID]: {
    status: 'partial',
    layer: 'win-interpretation-context',
    integrationNotes: [
      'Existing direct-source pon, chi and open-kan entities use the same fixed-group compiler.',
      'This module is independently installable from the response-source context module.',
    ],
  },
  [RESPONSE_WAIT_ID]: {
    status: 'partial',
    layer: 'wait-interpretation',
    integrationNotes: ['Classifies the response source position in exactly one accepted group without granting score.'],
  },
  [DIRECT_WAIT_ID]: {
    status: 'partial',
    layer: 'wait-interpretation',
    integrationNotes: ['Classifies the direct source position in exactly one accepted group without granting score.'],
  },
};

const modules = BASE_RIICHI_SEMANTIC_CATALOG.modules.map((module): SemanticModuleRecord => {
  const note = moduleNotes[module.id];
  return note ? { ...module, ...note } : module;
});

const services: SemanticServiceRecord[] = [
  ...BASE_RIICHI_SEMANTIC_CATALOG.services,
  {
    id: INTERPRETATION_SERVICE_ID,
    title: 'Finite partition interpretation proposal service',
    status: 'partial',
    provides: [
      'JSON-serializable group and structure profiles',
      'bounded non-authoritative partition candidate enumeration',
      'closed-calculus authoritative physical proposal validation',
      'response and direct physical-source adapters',
      'accepted interpretation facts',
      'configurable evidence relations',
    ],
    inputs: [
      'physical tile entities', 'subject-to-zone bindings', 'response or tracked direct source',
      'group-pattern formulas', 'structure slots', 'structured interpretation proposal',
    ],
    outputs: ['candidate proposals', 'accepted interpretation records', 'shape compatibility evidence'],
    excludes: ['tenpai enumeration', 'yaku', 'han', 'fu', 'limits', 'payments', 'settlement'],
    publicApis: [
      'compileResponsePartitionInterpretationModule',
      'compileTrackedSourcePartitionInterpretationModule',
      'enumeratePartitionInterpretations',
    ],
  },
  {
    id: FIXED_GROUP_SERVICE_ID,
    title: 'Related fixed-group interpretation context',
    status: 'partial',
    provides: [
      'atomic existing-group validation',
      'profile-to-fixed-group cardinality constraints',
      'physical membership verification',
      'closed/open context facts',
      'separate has-hand-shape evidence',
    ],
    inputs: [
      'accepted interpretation proposal', 'owned group entities', 'typed membership relations',
      'group type patterns', 'profile fixed-group counts',
    ],
    outputs: ['fixed-group context records', 'has-hand-shape relations'],
    excludes: ['concealed kan', 'added kan', 'group fu', 'yaku', 'payment'],
    publicApis: ['compileRelatedFixedGroupInterpretationModule'],
  },
  {
    id: WAIT_SERVICE_ID,
    title: 'Accepted source-group wait classification',
    status: 'partial',
    provides: [
      'single wait', 'double-pair wait', 'closed wait', 'edge wait', 'two-sided wait',
      'single-orphan wait', 'thirteen-sided-orphan wait',
    ],
    inputs: ['accepted partition proposal', 'physical source entity', 'source group membership'],
    outputs: ['durable wait-classification facts'],
    excludes: ['pre-win tenpai waits', 'furiten', 'fu award', 'yaku qualification'],
    publicApis: [],
  },
];

const gaps = BASE_RIICHI_SEMANTIC_CATALOG.gaps.map((gap): SemanticGapRecord => {
  if (gap.id !== 'gap.hand-interpretation') return gap;
  return {
    ...gap,
    status: 'partial',
    currentEvidence: [
      'A generic finite-partition registry describes four-groups-and-pair, seven-pairs and thirteen-orphans as data.',
      'Response and direct proposals are authoritatively checked against current physical zones and source exposure.',
      'Existing pon, chi and open-kan entities participate as atomic fixed groups through physical membership relations.',
      'Accepted source groups are classified as single, double-pair, closed, edge, two-sided or orphan waits.',
      'Structural acceptance creates has-hand-shape evidence independently from future yaku qualification.',
    ],
    notes: [
      'The current implementation covers post-source accepted structures, not all pre-source tenpai alternatives.',
      'Arbitrary non-partition special interpreters, concealed/added kan contexts and production yaku qualification remain missing.',
      'can-win-on remains a temporary compatibility relation until minimum-yaku qualification is inserted.',
    ],
  };
});

const profiles: SemanticProfileRecord[] = [
  ...BASE_RIICHI_SEMANTIC_CATALOG.profiles,
  {
    id: 'profile.riichi-response-interpretation',
    title: 'Response interpretation with fixed meld and wait context',
    status: 'partial',
    backends: ['backend.riichi-physical-opening'],
    modules: [
      'riichi.common-flow',
      RESPONSE_INTERPRETATION_ID,
      RESPONSE_FIXED_ID,
      RESPONSE_WAIT_ID,
    ],
    services: [
      'service.rule-language-authoring',
      'service.world-runtime-validation',
      INTERPRETATION_SERVICE_ID,
      FIXED_GROUP_SERVICE_ID,
      WAIT_SERVICE_ID,
    ],
    unresolvedGaps: [
      'gap.hand-interpretation',
      'gap.yaku-evaluation-pipeline',
      'gap.fu-limit-payment-interpretation',
      'gap.standard-settlement-integration',
      'gap.policy-consumers',
      'gap.kan-family',
      'gap.dora-consumers',
      'gap.draw-and-abortive-endings',
      'gap.match-lifecycle',
      'gap.penalty-policy',
      'gap.observation-projection',
      'gap.standard-riichi-declaration',
    ],
  },
  {
    id: 'profile.riichi-direct-interpretation',
    title: 'Direct-source interpretation with fixed meld and wait context',
    status: 'partial',
    backends: ['backend.riichi-physical-opening'],
    modules: [
      'riichi.common-flow',
      DIRECT_INTERPRETATION_ID,
      DIRECT_FIXED_ID,
      DIRECT_WAIT_ID,
    ],
    services: [
      'service.rule-language-authoring',
      'service.world-runtime-validation',
      INTERPRETATION_SERVICE_ID,
      FIXED_GROUP_SERVICE_ID,
      WAIT_SERVICE_ID,
    ],
    unresolvedGaps: [
      'gap.hand-interpretation',
      'gap.yaku-evaluation-pipeline',
      'gap.fu-limit-payment-interpretation',
      'gap.standard-settlement-integration',
      'gap.policy-consumers',
      'gap.kan-family',
      'gap.dora-consumers',
      'gap.draw-and-abortive-endings',
      'gap.match-lifecycle',
      'gap.penalty-policy',
      'gap.observation-projection',
      'gap.standard-riichi-declaration',
    ],
  },
];

export const RIICHI_SEMANTIC_CATALOG: RiichiSemanticCatalog = {
  ...BASE_RIICHI_SEMANTIC_CATALOG,
  schemaVersion: 'mahjong-semantic-catalog/0.4',
  modules,
  services,
  profiles,
  gaps,
};
