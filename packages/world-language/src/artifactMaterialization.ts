import type { WorldSource } from './ast.js';
import {
  instantiateRuleModule,
  type RuleModuleDefinition,
  type RuleModuleManifest,
} from './ruleModules.js';

export interface RuleModuleArtifactMaterializationOptions {
  parameters?: Record<string, unknown>;
  bindings?: Record<string, unknown>;
  /** Optional host world for modules whose artifacts depend on existing ids. */
  base?: WorldSource;
}

export interface RuleModuleArtifactMaterialization {
  artifacts: Record<string, unknown>;
  manifest: RuleModuleManifest;
}

function neutralWorld(): WorldSource {
  return {
    schemaVersion: 'mwl/artifact-materialization',
    id: 'world:artifact-materialization',
    entities: [],
    zones: [],
    relations: [],
    actions: [],
    procedures: [],
    responseWindows: [],
    corePrograms: { constraints: [], reducers: [], rewrites: [] },
    bootstrap: [],
    metadata: {},
  };
}

/**
 * Resolves parameters, bindings and module templates through the same path used
 * by normal world composition, then returns only the resulting artifacts and
 * manifest. Modules that patch or inspect host objects must provide `base`.
 */
export function materializeRuleModuleArtifacts(
  definition: RuleModuleDefinition,
  options: RuleModuleArtifactMaterializationOptions = {},
): RuleModuleArtifactMaterialization {
  const result = instantiateRuleModule(options.base ?? neutralWorld(), {
    definition,
    parameters: options.parameters,
    bindings: options.bindings,
  });
  return {
    artifacts: structuredClone(result.artifacts),
    manifest: structuredClone(result.manifest),
  };
}
