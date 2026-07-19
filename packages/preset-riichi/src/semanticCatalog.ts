import { RIICHI_RULE_MODULE_ANALYSES } from './ruleModuleCatalog.js';

export type SemanticImplementationStatus = 'implemented' | 'partial' | 'fixture-only' | 'missing';

export interface SemanticBackendRecord {
  id: string;
  title: string;
  status: SemanticImplementationStatus;
  provides: string[];
  excludes: string[];
  deterministic: boolean;
  sourceBoundary: string;
}

export interface SemanticModuleRecord {
  id: string;
  version: string;
  title?: string;
  status: SemanticImplementationStatus;
  layer: string;
  provides: string[];
  consumes: string[];
  integrationNotes: string[];
}

export interface SemanticServiceRecord {
  id: string;
  title: string;
  status: SemanticImplementationStatus;
  provides: string[];
  inputs: string[];
  outputs: string[];
  excludes: string[];
  publicApis: string[];
}

export interface SemanticGapRecord {
  id: string;
  title: string;
  layer: string;
  status: 'partial' | 'missing';
  currentEvidence: string[];
  requiredFor: string[];
  notes: string[];
}

export interface SemanticProfileRecord {
  id: string;
  title: string;
  status: SemanticImplementationStatus;
  backends: string[];
  modules: string[];
  services: string[];
  unresolvedGaps: string[];
}

export interface RiichiSemanticCatalog {
  schemaVersion: string;
  generatedFrom: string;
  backends: SemanticBackendRecord[];
  modules: SemanticModuleRecord[];
  services: SemanticServiceRecord[];
  profiles: SemanticProfileRecord[];
  gaps: SemanticGapRecord[];
}

const MODULE_STATUS: Record<string, Pick<SemanticModuleRecord, 'status' | 'layer' | 'integrationNotes'>> = {
  'riichi.common-flow': {
    status: 'implemented',
    layer: 'physical-procedure',
    integrationNotes: [
      'Installed by createRiichiWorldSource over the deterministic physical opening backend.',
      'Produces preliminary win.claimed events only; it does not interpret or settle a win.',
    ],
  },
  'local.open-nine-gates': {
    status: 'fixture-only',
    layer: 'score-eligibility',
    integrationNotes: ['Closed-calculus eligibility and award data exist, but no production yaku registry consumes them yet.'],
  },
  'local.low-sum-manzu-flush': {
    status: 'fixture-only',
    layer: 'score-eligibility',
    integrationNotes: ['Closed-calculus eligibility and award data exist, but no production yaku registry consumes them yet.'],
  },
  'local.stone-on-three-years': {
    status: 'fixture-only',
    layer: 'score-eligibility',
    integrationNotes: ['Event-history eligibility and parameter variants exist, but no production yaku registry consumes them yet.'],
  },
  'local.thirteen-misfits': {
    status: 'fixture-only',
    layer: 'special-hand-eligibility',
    integrationNotes: ['Special-hand eligibility exists independently of normal partition acceptance, but no production win interpreter consumes it yet.'],
  },
  'local.eight-consecutive-wins': {
    status: 'fixture-only',
    layer: 'cross-hand-score-eligibility',
    integrationNotes: ['The event reducer and threshold program exist, but match/hand lifecycle events are not production-wired.'],
  },
  'rule.super-riichi': {
    status: 'fixture-only',
    layer: 'declaration-policy',
    integrationNotes: [
      'The complete declaration, resource, policy and reveal semantics execute through WorldRuntime.',
      'The standard production preset does not yet provide the compatible point-ledger and dora-consumer integration.',
    ],
  },
  'rule.turbo-riichi.declaration': {
    status: 'fixture-only',
    layer: 'declaration-policy',
    integrationNotes: [
      'Disclosure, stake, score contribution and all-player discard-policy facts execute through WorldRuntime.',
      'The standard production preset does not yet consume all policy tracks.',
    ],
  },
  'flow.continuing-multi-win': {
    status: 'fixture-only',
    layer: 'response-and-outcome-flow',
    integrationNotes: [
      'Selected and direct repeated outcomes, response batches and continuation gates execute through WorldRuntime.',
      'The common production flow lacks an exhaustive-draw action compatible with this module selector.',
    ],
  },
};

const modules: SemanticModuleRecord[] = RIICHI_RULE_MODULE_ANALYSES.map((analysis) => {
  const status = MODULE_STATUS[analysis.id] ?? {
    status: 'partial' as const,
    layer: 'unclassified',
    integrationNotes: ['Module is analyzable but has no explicit integration classification.'],
  };
  return {
    id: analysis.id,
    version: analysis.version,
    title: analysis.title,
    status: status.status,
    layer: status.layer,
    provides: [
      ...analysis.provides.actions.map((id) => `action:${id}`),
      ...analysis.provides.procedures.map((id) => `procedure:${id}`),
      ...analysis.provides.responseWindows.map((id) => `response-window:${id}`),
      ...analysis.provides.constraints.map((id) => `constraint:${id}`),
      ...analysis.provides.reducers.map((id) => `reducer:${id}`),
      ...analysis.provides.rewrites.map((id) => `rewrite:${id}`),
      ...analysis.provides.events.map((id) => `event:${id}`),
      ...analysis.provides.artifacts.map((id) => `artifact:${id}`),
    ],
    consumes: [
      ...analysis.requiredBindings.map((id) => `binding:${id}`),
      ...analysis.consumes.patchedActions.map((id) => `action:${id}`),
      ...analysis.consumes.patchedWindows.map((id) => `response-window:${id}`),
      ...analysis.consumes.patchedProcedures.map((id) => `procedure-node:${id}`),
    ],
    integrationNotes: status.integrationNotes,
  };
});

const gaps: SemanticGapRecord[] = [
  {
    id: 'gap.standard-riichi-declaration',
    title: 'Production standard riichi declaration',
    layer: 'declaration-policy',
    status: 'missing',
    currentEvidence: ['Super and Turbo declaration modules prove the required generic facts and policies.'],
    requiredFor: ['ordinary riichi', 'double riichi', 'ippatsu', 'ura-dora access', 'riichi furiten'],
    notes: ['The common production flow currently has no ordinary riichi declaration action or point-ledger integration.'],
  },
  {
    id: 'gap.hand-interpretation',
    title: 'Authoritative hand and wait interpretation',
    layer: 'win-interpretation',
    status: 'missing',
    currentEvidence: ['Tests currently inject can-win-on relations as fixture evidence.'],
    requiredFor: ['ron', 'tsumo', 'tenpai', 'furiten', 'special hands', 'yaku evaluation'],
    notes: ['Normal partitions, seven pairs, thirteen orphans and arbitrary non-five-group structures need proposal-producing interpreters.'],
  },
  {
    id: 'gap.yaku-evaluation-pipeline',
    title: 'Registered yaku evaluation pipeline',
    layer: 'score-interpretation',
    status: 'missing',
    currentEvidence: ['Five local-yaku modules and generic score-contribution facts exist.'],
    requiredFor: ['minimum-yaku qualification', 'ordinary yaku', 'local yaku', 'negative han', 'stage ordering'],
    notes: ['Eligibility modules are not yet automatically evaluated against authoritative win contexts.'],
  },
  {
    id: 'gap.fu-limit-payment-interpretation',
    title: 'Fu, limits and payment-shape interpretation',
    layer: 'score-interpretation',
    status: 'missing',
    currentEvidence: ['The generic outcome-to-settlement pipeline can carry accepted transfer proposals.'],
    requiredFor: ['ron payment', 'tsumo payment', 'mangan and yakuman', 'responsibility payment', 'rounding'],
    notes: ['Current settlement tests use synthetic fixed-transfer profiles, not riichi scoring.'],
  },
  {
    id: 'gap.standard-settlement-integration',
    title: 'Standard hand settlement and continuation policy',
    layer: 'settlement',
    status: 'missing',
    currentEvidence: ['Atomic aggregate ledger validation and settlement transactions are implemented generically.'],
    requiredFor: ['honba', 'riichi pot', 'dealer continuation', 'multiple winners', 'bankruptcy', 'match end'],
    notes: ['The production preset still stores player score components rather than using the generic point ledger.'],
  },
  {
    id: 'gap.policy-consumers',
    title: 'Production discard and missed-opportunity policy consumers',
    layer: 'adjudication-policy',
    status: 'partial',
    currentEvidence: ['Continuing multi-win consumes latest-draw discard policies in its fixture flow.'],
    requiredFor: ['ordinary riichi tsumogiri', 'riichi-pass furiten', 'temporary furiten', 'rule-specific action restrictions'],
    notes: ['The common production flow does not yet consume generic discard-policy or furiten-policy tracks.'],
  },
  {
    id: 'gap-kan-family',
    title: 'Complete kan family and post-kan procedures',
    layer: 'physical-procedure',
    status: 'partial',
    currentEvidence: ['Open kan from a discard creates a meld and transitions to await-kan-draw.'],
    requiredFor: ['concealed kan', 'added kan', 'chankan', 'rinshan draw', 'kan dora', 'four-kan abort'],
    notes: ['The await-kan-draw node exists, but no replacement-draw action or remaining kan variants are implemented.'],
  },
  {
    id: 'gap-dora-consumers',
    title: 'Dora, ura-dora and kan-dora consumption',
    layer: 'score-interpretation',
    status: 'partial',
    currentEvidence: ['Super riichi maintains a public reveal track and can shift the live/dead wall boundary.'],
    requiredFor: ['dora han', 'ura-dora', 'kan-dora', 'indicator successor mapping'],
    notes: ['Reveal records exist, but no production score interpreter consumes indicator channels.'],
  },
  {
    id: 'gap-draw-and-abortive-endings',
    title: 'Exhaustive and abortive hand endings',
    layer: 'hand-lifecycle',
    status: 'missing',
    currentEvidence: ['A generic test turn world has an exhaustive-draw action; the common production flow does not.'],
    requiredFor: ['exhaustive draw', 'tenpai payments', 'nine terminals', 'four winds', 'four riichi', 'four kan'],
    notes: ['Continuing multi-win correctly diagnoses the absent production end action rather than guessing one.'],
  },
  {
    id: 'gap-match-lifecycle',
    title: 'Round, hand and match lifecycle',
    layer: 'match-procedure',
    status: 'missing',
    currentEvidence: ['Cross-hand reducers can consume hand.ended and hand.drawn when those events exist.'],
    requiredFor: ['dealer rotation', 'round wind', 'honba', 'all-last', 'agari-yame', 'tobi', 'ranking'],
    notes: ['The current preset creates one hand world and does not progress a full match.'],
  },
  {
    id: 'gap-penalty-policy',
    title: 'Penalty and chombo policy composition',
    layer: 'adjudication-policy',
    status: 'missing',
    currentEvidence: ['The runtime distinguishes reject, invalid, stale and transactional rollback.'],
    requiredFor: ['chombo', 'dead-hand penalties', 'illegal call penalties', 'custom punishments'],
    notes: ['No production rule module maps specific adjudication failures to penalties yet.'],
  },
  {
    id: 'gap-observation-projection',
    title: 'Production private/public observation projections',
    layer: 'observation',
    status: 'partial',
    currentEvidence: ['Visibility facts and public reveal tracks are represented independently from ownership.'],
    requiredFor: ['private hands', 'spectator views', 'delayed reveals', 'replay redaction'],
    notes: ['A complete client projection layer is not yet connected to every fact and zone.'],
  },
];

export const RIICHI_SEMANTIC_CATALOG: RiichiSemanticCatalog = {
  schemaVersion: 'mahjong-semantic-catalog/0.1',
  generatedFrom: 'RIICHI_RULE_MODULE_ANALYSES',
  backends: [
    {
      id: 'backend.riichi-physical-opening',
      title: 'Deterministic physical tile and wall opening backend',
      status: 'implemented',
      provides: [
        'independent tile entities', 'arbitrary copies per face', 'tile variants', 'deterministic shuffle',
        'dice evidence', 'wall stacks', 'live wall', 'dead wall', 'physical contains relations',
      ],
      excludes: ['deal rules', 'turn rules', 'calls', 'win interpretation', 'scoring', 'settlement'],
      deterministic: true,
      sourceBoundary: 'createRiichiPhysicalWorldSource',
    },
  ],
  modules,
  services: [
    {
      id: 'service.rule-language-authoring',
      title: 'Rule module authoring and compilation service',
      status: 'implemented',
      provides: [
        'module validation', 'semantic analysis', 'binding resolution', 'composition diagnosis',
        'module instantiation', 'World Image compilation', 'module manifests', 'semantic diff',
      ],
      inputs: ['WorldSource', 'RuleModuleDefinition', 'parameters', 'bindings', 'binding selectors'],
      outputs: ['WorldSource', 'WorldImage', 'artifacts', 'manifests', 'diagnostics'],
      excludes: ['natural-language interpretation transport', 'persistent module registry', 'authorization'],
      publicApis: [
        'instantiateRuleModule', 'composeWorldModules', 'composeWorldModulesWithAutoBindings',
        'analyzeRuleModuleDefinition', 'analyzeWorldSource', 'diagnoseModuleComposition',
      ],
    },
    {
      id: 'service.world-runtime-validation',
      title: 'Runtime simulation and bounded validation service',
      status: 'implemented',
      provides: ['revisioned simulation', 'stale handling', 'attempt idempotence', 'bounded counterexample search', 'explanations', 'dependencies', 'World Image diff'],
      inputs: ['compiled World Image', 'finite attempts', 'closed-calculus invariants', 'explicit bounds'],
      outputs: ['receipts', 'events', 'final snapshots', 'counterexample traces', 'dependency views'],
      excludes: ['unbounded theorem proving', 'arbitrary callbacks'],
      publicApis: ['createDefaultMahjongLanguageRuntimeAdapter'],
    },
    {
      id: 'service.outcome-settlement',
      title: 'Generic outcome interpretation and atomic settlement service',
      status: 'implemented',
      provides: ['outcome batches', 'interpretation proposals', 'interpretation progress', 'settlement batches', 'aggregate ledger feasibility', 'atomic transactions'],
      inputs: ['outcome records', 'evidence bindings', 'transfer-shape definitions', 'resource ledger'],
      outputs: ['accepted proposals', 'ordered transfers', 'committed settlement transactions'],
      excludes: ['hand interpretation', 'yaku', 'fu', 'riichi-specific payment formulas'],
      publicApis: ['compileOutcomeSettlementPrograms', 'composeOutcomeSettlementModule'],
    },
  ],
  profiles: [
    {
      id: 'profile.riichi-common-current',
      title: 'Current common riichi hand profile',
      status: 'partial',
      backends: ['backend.riichi-physical-opening'],
      modules: ['riichi.common-flow'],
      services: ['service.rule-language-authoring', 'service.world-runtime-validation'],
      unresolvedGaps: gaps.map((entry) => entry.id),
    },
    {
      id: 'profile.super-riichi-fixture',
      title: 'Executable Super riichi pressure-test profile',
      status: 'fixture-only',
      backends: [],
      modules: ['rule.super-riichi'],
      services: ['service.rule-language-authoring', 'service.world-runtime-validation'],
      unresolvedGaps: ['gap-hand-interpretation', 'gap-dora-consumers', 'gap-standard-settlement-integration'],
    },
    {
      id: 'profile.turbo-riichi-fixture',
      title: 'Executable Turbo riichi and continuing multi-win pressure-test profile',
      status: 'fixture-only',
      backends: [],
      modules: ['rule.turbo-riichi.declaration', 'flow.continuing-multi-win'],
      services: ['service.outcome-settlement', 'service.rule-language-authoring', 'service.world-runtime-validation'],
      unresolvedGaps: ['gap.hand-interpretation', 'gap.fu-limit-payment-interpretation', 'gap.standard-settlement-integration'],
    },
  ],
  gaps,
};
