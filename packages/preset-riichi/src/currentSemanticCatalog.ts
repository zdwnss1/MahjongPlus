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

const INTERPRETATION_MODULE_ID = 'service.riichi-response-hand-interpretation';
const INTERPRETATION_SERVICE_ID = 'service.finite-partition-interpretation';

const modules = BASE_RIICHI_SEMANTIC_CATALOG.modules.map((module): SemanticModuleRecord => (
  module.id === INTERPRETATION_MODULE_ID
    ? {
        ...module,
        status: 'partial',
        layer: 'win-interpretation',
        integrationNotes: [
          'Response/ron proposals for finite partition structures are revalidated against the current physical hand zone and response-window source entity.',
          'Accepted proposals create durable interpretation facts and configurable evidence relations without granting yaku, han, fu or settlement.',
          'Direct/self-draw, meld-aware, wait-classification and non-partition interpretation remain separate gaps.',
        ],
      }
    : module
));

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
      'accepted interpretation facts',
      'configurable evidence relations',
      'structured nested action input schemas',
    ],
    inputs: [
      'physical item entities', 'subject-to-zone bindings', 'response-window source',
      'group-pattern formulas', 'structure slots', 'structured interpretation proposal',
    ],
    outputs: ['candidate proposals', 'accepted interpretation records', 'evidence relations'],
    excludes: [
      'direct/self-draw interpretation', 'meld-aware concealed/open composition', 'wait classification',
      'yaku', 'han', 'fu', 'limits', 'payments', 'settlement',
    ],
    publicApis: [
      'compileResponsePartitionInterpretationModule',
      'enumeratePartitionInterpretations',
    ],
  },
];

const gaps = BASE_RIICHI_SEMANTIC_CATALOG.gaps.map((gap): SemanticGapRecord => {
  if (gap.id !== 'gap.hand-interpretation') return gap;
  return {
    ...gap,
    status: 'partial',
    currentEvidence: [
      'A generic finite-partition registry now describes four-groups-and-pair, seven-pairs and thirteen-orphans structures as data.',
      'Response proposals are authoritatively checked against the current physical hand zone, winning tile, source exposure and exact group coverage.',
      'Accepted proposals create can-win-on evidence consumed by the ordinary ron action.',
    ],
    notes: [
      'The current implementation covers response/ron partition structures only.',
      'Direct/self-draw, existing meld integration, wait classification, tenpai enumeration and arbitrary non-partition interpreters remain missing.',
    ],
  };
});

const profiles: SemanticProfileRecord[] = [
  ...BASE_RIICHI_SEMANTIC_CATALOG.profiles,
  {
    id: 'profile.riichi-response-interpretation',
    title: 'Common response flow plus authoritative finite partition interpretation',
    status: 'partial',
    backends: ['backend.riichi-physical-opening'],
    modules: ['riichi.common-flow', INTERPRETATION_MODULE_ID],
    services: [
      'service.rule-language-authoring',
      'service.world-runtime-validation',
      INTERPRETATION_SERVICE_ID,
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
  schemaVersion: 'mahjong-semantic-catalog/0.2',
  modules,
  services,
  profiles,
  gaps,
};
