import type { WorldSource } from './ast.js';
import {
  composeWorldModulesWithAutoBindings,
  resolveRuleModuleBindings,
} from './bindingResolution.js';
import { compileWorld } from './compiler.js';
import {
  MAHJONG_LANGUAGE_MCP_CATALOG,
  MAHJONG_LANGUAGE_SYSTEM_PROMPT,
} from './mahjongMcp.js';
import {
  composeWorldModules,
  instantiateRuleModule,
  validateRuleModuleDefinition,
  type RuleModuleApplication,
  type RuleModuleDefinition,
} from './ruleModules.js';
import {
  analyzeRuleModuleDefinition,
  analyzeWorldSource,
  diagnoseModuleComposition,
  diagnoseWorldSemantics,
} from './semanticAnalysis.js';

export interface MahjongLanguageRuntimeAdapter {
  simulate?(input: Record<string, unknown>): unknown;
  findCounterexample?(input: Record<string, unknown>): unknown;
  explain?(input: Record<string, unknown>): unknown;
  dependencies?(input: Record<string, unknown>): unknown;
  diff?(input: Record<string, unknown>): unknown;
}

export interface MahjongLanguageSessionOptions {
  modules?: RuleModuleDefinition[];
  resources?: Record<string, unknown>;
  runtime?: MahjongLanguageRuntimeAdapter;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function moduleKey(id: string, version: string): string {
  return `${id}@${version}`;
}

export class MahjongLanguageAuthoringSession {
  private readonly modules = new Map<string, RuleModuleDefinition>();
  private readonly resources = new Map<string, unknown>();
  private readonly runtime?: MahjongLanguageRuntimeAdapter;

  constructor(options: MahjongLanguageSessionOptions = {}) {
    this.runtime = options.runtime;
    for (const module of options.modules ?? []) this.registerModule(module);
    for (const [uri, resource] of Object.entries(options.resources ?? {})) this.registerResource(uri, resource);
  }

  registerModule(module: RuleModuleDefinition): void {
    const errors = validateRuleModuleDefinition(module);
    if (errors.length > 0) throw new Error(errors.join('\n'));
    const key = moduleKey(module.id, module.version);
    if (this.modules.has(key)) throw new Error(`Duplicate rule module ${key}.`);
    this.modules.set(key, structuredClone(module));
  }

  registerResource(uri: string, resource: unknown): void {
    if (!uri) throw new Error('Resource uri must be non-empty.');
    if (this.resources.has(uri)) throw new Error(`Duplicate Mahjong language resource ${uri}.`);
    this.resources.set(uri, structuredClone(resource));
  }

  listModules(prefix = ''): Array<{ id: string; version: string; title?: string }> {
    return [...this.modules.values()]
      .filter((module) => module.id.startsWith(prefix))
      .map((module) => ({ id: module.id, version: module.version, title: module.title }))
      .sort((left, right) => moduleKey(left.id, left.version).localeCompare(moduleKey(right.id, right.version)));
  }

  readModule(id: string, version?: string): RuleModuleDefinition {
    const matches = [...this.modules.values()].filter((module) => module.id === id && (!version || module.version === version));
    if (matches.length === 0) throw new Error(`Unknown rule module ${id}${version ? `@${version}` : ''}.`);
    if (!version && matches.length !== 1) throw new Error(`Rule module ${id} requires an explicit version.`);
    return structuredClone(matches[0]);
  }

  readResource(uri: string): unknown {
    if (this.resources.has(uri)) return structuredClone(this.resources.get(uri));
    if (uri === 'mahjongplus://language/system-prompt') return MAHJONG_LANGUAGE_SYSTEM_PROMPT;
    if (uri === 'mahjongplus://language/spec') {
      return {
        semanticKernel: [
          'typed values', 'entities', 'relations', 'ordered zones', 'events',
          'finite-domain constraints', 'reducers', 'transactional rewrites',
          'procedures', 'response windows', 'visibility projections', 'resource ledgers',
        ],
        moduleTemplateOperations: [
          'ref', 'template', 'entity-index', 'zone-index', 'concat', 'if', 'eq', 'not',
          'map', 'filter', 'range', 'merge', 'arithmetic',
        ],
        bindingSelectors: [
          'entity-id', 'zone-id', 'action-id', 'procedure-id', 'procedure-node-id',
          'world-metadata', 'relation-type', 'artifact', 'literal',
          'cycle-pairs', 'null-records', 'zone-entry-candidates',
        ],
        semanticAnalysis: [
          'provided resources', 'consumed bindings', 'patch targets', 'action semantics',
          'event producers', 'program reads', 'program writes', 'composition diagnostics',
        ],
        invariant: 'Concrete rules are JSON-serializable RuleModuleDefinition data, never host functions.',
      };
    }
    if (uri === 'mahjongplus://schema/rule-module') {
      return {
        required: ['id', 'version'],
        sections: ['parameters', 'requiredBindings', 'bindingSelectors', 'additions', 'patches', 'artifacts', 'metadata'],
      };
    }
    if (uri === 'mahjongplus://stdlib') {
      return {
        modules: ['progress batches', 'response gates', 'record gates', 'ledger transfer feasibility', 'ledger transfer commit'],
      };
    }
    if (uri === 'mahjongplus://schema/world') return { type: 'WorldSource' };
    throw new Error(`Unknown Mahjong language resource ${uri}.`);
  }

  callTool(name: string, input: Record<string, unknown>): unknown {
    if (name === 'mahjong.schema.describe') {
      const section = typeof input.section === 'string' ? input.section : 'language';
      return section === 'catalog' ? structuredClone(MAHJONG_LANGUAGE_MCP_CATALOG) : this.readResource('mahjongplus://language/spec');
    }
    if (name === 'mahjong.catalog.inspect') {
      return this.readResource(typeof input.uri === 'string' ? input.uri : 'mahjongplus://catalog/current');
    }
    if (name === 'mahjong.module.list') {
      return this.listModules(typeof input.prefix === 'string' ? input.prefix : '');
    }
    if (name === 'mahjong.module.read') {
      return this.readModule(requireString(input.id, 'id'), typeof input.version === 'string' ? input.version : undefined);
    }
    if (name === 'mahjong.module.validate') {
      return { errors: validateRuleModuleDefinition(input.module as RuleModuleDefinition) };
    }
    if (name === 'mahjong.module.analyze') {
      return analyzeRuleModuleDefinition(input.module as RuleModuleDefinition);
    }
    if (name === 'mahjong.module.resolve-bindings') {
      return resolveRuleModuleBindings(
        input.world as WorldSource,
        input.module as RuleModuleDefinition,
        input.bindings ? asRecord(input.bindings, 'bindings') : {},
        input.artifacts ? asRecord(input.artifacts, 'artifacts') : {},
      );
    }
    if (name === 'mahjong.module.instantiate') {
      const world = input.world as WorldSource;
      const module = input.module as RuleModuleDefinition;
      return instantiateRuleModule(world, {
        definition: module,
        parameters: input.parameters ? asRecord(input.parameters, 'parameters') : undefined,
        bindings: input.bindings ? asRecord(input.bindings, 'bindings') : undefined,
      });
    }
    if (name === 'mahjong.world.compose') {
      const world = input.world as WorldSource;
      const applications = input.applications as RuleModuleApplication[];
      if (!Array.isArray(applications)) throw new Error('applications must be an array.');
      return composeWorldModules(world, applications);
    }
    if (name === 'mahjong.world.compose-auto') {
      const applications = input.applications as RuleModuleApplication[];
      if (!Array.isArray(applications)) throw new Error('applications must be an array.');
      return composeWorldModulesWithAutoBindings(input.world as WorldSource, applications);
    }
    if (name === 'mahjong.world.analyze') return analyzeWorldSource(input.world as WorldSource);
    if (name === 'mahjong.world.diagnose') {
      const applications = input.applications as RuleModuleApplication[] | undefined;
      return applications
        ? diagnoseModuleComposition(input.world as WorldSource, applications)
        : { diagnostics: diagnoseWorldSemantics(input.world as WorldSource) };
    }
    if (name === 'mahjong.world.compile') return compileWorld(input.world as WorldSource);
    if (name === 'mahjong.world.simulate') return this.requireRuntime('simulate', input);
    if (name === 'mahjong.world.find-counterexample') return this.requireRuntime('findCounterexample', input);
    if (name === 'mahjong.world.explain') return this.requireRuntime('explain', input);
    if (name === 'mahjong.world.dependencies') return this.requireRuntime('dependencies', input);
    if (name === 'mahjong.world.diff') return this.requireRuntime('diff', input);
    throw new Error(`Unknown Mahjong language tool ${name}.`);
  }

  private requireRuntime(method: keyof MahjongLanguageRuntimeAdapter, input: Record<string, unknown>): unknown {
    const handler = this.runtime?.[method];
    if (!handler) throw new Error(`Tool requires a MahjongLanguageRuntimeAdapter.${method} implementation.`);
    return handler(input);
  }
}
