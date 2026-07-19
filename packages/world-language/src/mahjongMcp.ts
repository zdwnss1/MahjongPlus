export interface MahjongLanguageToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface MahjongLanguageResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MahjongLanguageMcpCatalog {
  protocolVersion: string;
  tools: MahjongLanguageToolDescriptor[];
  resources: MahjongLanguageResourceDescriptor[];
}

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const MAHJONG_LANGUAGE_MCP_CATALOG: MahjongLanguageMcpCatalog = {
  protocolVersion: 'mahjong-language-mcp/0.2',
  tools: [
    {
      name: 'mahjong.schema.describe',
      description: 'Read the closed calculus, rule-module template operations, world schema, and generic standard-library vocabulary.',
      inputSchema: objectSchema({ section: { type: 'string' } }),
    },
    {
      name: 'mahjong.module.list',
      description: 'List declarative rule modules available to the current world-authoring session.',
      inputSchema: objectSchema({ prefix: { type: 'string' } }),
    },
    {
      name: 'mahjong.module.read',
      description: 'Read one declarative RuleModuleDefinition by id and version.',
      inputSchema: objectSchema({ id: { type: 'string' }, version: { type: 'string' } }, ['id']),
    },
    {
      name: 'mahjong.module.validate',
      description: 'Validate JSON serializability, parameter schema, required bindings, template operations, and closed-calculus vocabulary.',
      inputSchema: objectSchema({ module: { type: 'object' } }, ['module']),
    },
    {
      name: 'mahjong.module.analyze',
      description: 'Parse one rule module into provided resources, consumed bindings, patches, action semantics, events and core-program read/write paths.',
      inputSchema: objectSchema({ module: { type: 'object' } }, ['module']),
    },
    {
      name: 'mahjong.module.instantiate',
      description: 'Expand one RuleModuleDefinition against a base WorldSource using explicit parameters and bindings.',
      inputSchema: objectSchema({
        world: { type: 'object' },
        module: { type: 'object' },
        parameters: { type: 'object' },
        bindings: { type: 'object' },
      }, ['world', 'module']),
    },
    {
      name: 'mahjong.world.compose',
      description: 'Compose an ordered list of declarative modules into one WorldSource and return module manifests and artifacts.',
      inputSchema: objectSchema({ world: { type: 'object' }, applications: { type: 'array', items: { type: 'object' } } }, ['world', 'applications']),
    },
    {
      name: 'mahjong.world.analyze',
      description: 'Parse a WorldSource into physical inventory, actions, procedures, response windows, event producers, programs and installed module manifests.',
      inputSchema: objectSchema({ world: { type: 'object' } }, ['world']),
    },
    {
      name: 'mahjong.world.diagnose',
      description: 'Diagnose a WorldSource or an ordered module composition for missing bindings, invalid references, duplicate ids and overlapping rewrite paths.',
      inputSchema: objectSchema({
        world: { type: 'object' },
        applications: { type: 'array', items: { type: 'object' } },
      }, ['world']),
    },
    {
      name: 'mahjong.world.compile',
      description: 'Compile and hash a WorldSource. Reject duplicate ids, invalid references, undeclared programs, and invalid core programs.',
      inputSchema: objectSchema({ world: { type: 'object' } }, ['world']),
    },
    {
      name: 'mahjong.world.simulate',
      description: 'Run a deterministic sequence of revisioned action attempts against a compiled World Image.',
      inputSchema: objectSchema({
        world: { type: 'object' },
        attempts: { type: 'array', items: { type: 'object' } },
      }, ['world', 'attempts']),
    },
    {
      name: 'mahjong.world.find-counterexample',
      description: 'Search bounded inputs and event traces for a counterexample to a declared rule invariant.',
      inputSchema: objectSchema({
        world: { type: 'object' },
        invariant: { type: 'object' },
        bounds: { type: 'object' },
      }, ['world', 'invariant']),
    },
    {
      name: 'mahjong.world.explain',
      description: 'Explain why an action, constraint, reducer transition, rewrite, or settlement batch was accepted or rejected.',
      inputSchema: objectSchema({
        world: { type: 'object' },
        subject: { type: 'object' },
      }, ['world', 'subject']),
    },
    {
      name: 'mahjong.world.dependencies',
      description: 'Inspect program reads, writes, event inputs, action patches, and module dependency order.',
      inputSchema: objectSchema({ world: { type: 'object' }, moduleId: { type: 'string' } }, ['world']),
    },
    {
      name: 'mahjong.world.diff',
      description: 'Compare two module compositions or World Images at semantic, physical, procedural, and visibility layers.',
      inputSchema: objectSchema({ before: { type: 'object' }, after: { type: 'object' } }, ['before', 'after']),
    },
  ],
  resources: [
    {
      uri: 'mahjongplus://language/spec',
      name: 'Mahjong language specification',
      description: 'Closed semantic kernel, module template vocabulary, module admission rules, and physical-reality invariants.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'mahjongplus://language/system-prompt',
      name: 'Rule author system prompt',
      description: 'System prompt for an LLM that authors and modifies declarative Mahjong rule modules.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'mahjongplus://schema/world',
      name: 'World schema',
      description: 'Current WorldSource, action, procedure, response-window, event, zone, relation, and core-program schemas.',
      mimeType: 'application/schema+json',
    },
    {
      uri: 'mahjongplus://schema/rule-module',
      name: 'Rule module schema',
      description: 'RuleModuleDefinition, parameters, bindings, additions, patches, artifacts, and template operations.',
      mimeType: 'application/schema+json',
    },
    {
      uri: 'mahjongplus://stdlib',
      name: 'Mahjong language standard library',
      description: 'Generic macros for finite sets, progress batches, record gates, ledger transfers, and response windows.',
      mimeType: 'application/json',
    },
  ],
};

export const MAHJONG_LANGUAGE_SYSTEM_PROMPT = `You are a Mahjong rule-language author.

Your output is never TypeScript, JavaScript, a host callback, a rule-specific function, or a new runtime branch. Concrete rules exist only as JSON-serializable RuleModuleDefinition data. A concrete rule name may appear in ids, titles, descriptions, tests, and data values, but never in compiler, runtime, or standard-library API names.

Use the closed semantic kernel: typed values, entities, relations, ordered zones, events, finite-domain constraints, reducers, transactional rewrites, procedures, response windows, visibility projections, and generic resource ledgers. Do not add a new core node merely because a rule is difficult. First express it through composition, module template expansion, or an existing backend.

Physical reality is the minimum semantic floor. Every tile is an independent entity. Revealing a tile does not imply moving it, changing ownership, or opening a hand unless separate facts say so. Actions may be attempted even when illegal; the authoritative server adjudicates them. Stale attempts never receive penalties. Duplicate attempt ids are idempotent.

Authoring workflow:
1. Read mahjongplus://language/spec and mahjongplus://schema/rule-module.
2. Inspect the base world schema and the modules already installed.
3. Analyze existing modules and the target world before authoring a change.
4. Represent the requested change as one or more RuleModuleDefinition objects with explicit parameter schemas and required bindings.
5. Use module additions and patches instead of editing host code.
6. Validate and analyze the module.
7. Diagnose the proposed composition before instantiation.
8. Instantiate it against the target world with explicit bindings.
9. Compile the resulting world.
10. Simulate positive, negative, stale, duplicate-attempt, rollback, visibility, and physical-identity cases.
11. Search for bounded counterexamples to the intended invariant.
12. Explain dependencies, reads, writes, and lifecycle effects before presenting the change.

Never hide semantics in a label such as riichi, yaku, win, settlement, meld, or dora. Decompose them into independent facts: resource transfers, declarations, score contributions, discard policies, missed-opportunity policies, visibility records, outcome batches, interpretation proposals, settlement batches, and transactions.

A new core primitive is admissible only when the existing kernel cannot express the behavior, no standard-library macro can expand it, the primitive is domain-agnostic, deterministic, bounded, compositional, statically analyzable, and useful in at least three unrelated domains. Otherwise keep it in module data or the standard library.

When modifying a world, call tools rather than describing hypothetical code. Do not claim success until module validation, semantic analysis, composition diagnosis, world compilation, simulation, and the relevant counterexample search all pass.`;
