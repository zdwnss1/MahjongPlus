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
  protocolVersion: 'mahjong-language-mcp/0.5',
  tools: [
    {
      name: 'mahjong.schema.describe',
      description: 'Read the closed calculus, rule-module template operations, world schema, binding selectors, interpretation profiles, and generic standard-library vocabulary.',
      inputSchema: objectSchema({ section: { type: 'string' } }),
    },
    {
      name: 'mahjong.catalog.inspect',
      description: 'Read the injected machine-readable semantic catalog for the current game or ruleset, including backends, modules, services, profiles and known gaps.',
      inputSchema: objectSchema({ uri: { type: 'string' } }),
    },
    {
      name: 'mahjong.interpretation.compile-registry',
      description: 'Compile JSON-serializable finite partition interpretation profiles into an ordinary RuleModuleDefinition with authoritative physical proposal validation.',
      inputSchema: objectSchema({ registry: { type: 'object' } }, ['registry']),
    },
    {
      name: 'mahjong.interpretation.enumerate',
      description: 'Enumerate bounded non-authoritative candidate partition proposals from one profile, explicit physical item records and an exposure source. Candidates still require authoritative server validation.',
      inputSchema: objectSchema({
        profile: { type: 'object' },
        items: { type: 'array', items: { type: 'object' } },
        source: { type: 'object' },
      }, ['profile', 'items', 'source']),
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
      name: 'mahjong.module.resolve-bindings',
      description: 'Resolve a module’s declarative binding selectors against the current world and prior module artifacts. Explicit supplied bindings take precedence; zero or multiple matches are returned as diagnostics.',
      inputSchema: objectSchema({
        world: { type: 'object' },
        module: { type: 'object' },
        bindings: { type: 'object' },
        artifacts: { type: 'object' },
      }, ['world', 'module']),
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
      description: 'Compose an ordered list of declarative modules with explicit bindings into one WorldSource and return module manifests and artifacts.',
      inputSchema: objectSchema({ world: { type: 'object' }, applications: { type: 'array', items: { type: 'object' } } }, ['world', 'applications']),
    },
    {
      name: 'mahjong.world.compose-auto',
      description: 'Resolve declarative selectors for each ordered module against the evolving world and prior artifacts, then instantiate every unambiguous module. Stops on the first unresolved binding and returns diagnostics.',
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
      description: 'Closed semantic kernel, module template and binding-selector vocabulary, interpretation profile model, module admission rules, and physical-reality invariants.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'mahjongplus://language/system-prompt',
      name: 'Rule author system prompt',
      description: 'System prompt for an LLM that authors and modifies declarative Mahjong rule modules.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'mahjongplus://catalog/current',
      name: 'Current semantic catalog',
      description: 'Injected ruleset-specific inventory of physical backends, modules, generic services, executable profiles and known semantic gaps.',
      mimeType: 'application/json',
    },
    {
      uri: 'mahjongplus://schema/world',
      name: 'World schema',
      description: 'Current WorldSource, action, structured input-schema, procedure, response-window, event, zone, relation, and core-program schemas.',
      mimeType: 'application/schema+json',
    },
    {
      uri: 'mahjongplus://schema/rule-module',
      name: 'Rule module schema',
      description: 'RuleModuleDefinition, parameters, bindings, selectors, additions, patches, artifacts, interpretation registries, and template operations.',
      mimeType: 'application/schema+json',
    },
    {
      uri: 'mahjongplus://stdlib',
      name: 'Mahjong language standard library',
      description: 'Generic macros for finite sets, finite partition interpretations, progress batches, record gates, ledger transfers, and response windows.',
      mimeType: 'application/json',
    },
  ],
};

export const MAHJONG_LANGUAGE_SYSTEM_PROMPT = `You are a Mahjong rule-language author.

Your output is never TypeScript, JavaScript, a host callback, a rule-specific function, or a new runtime branch. Concrete rules exist only as JSON-serializable RuleModuleDefinition data. A concrete rule name may appear in ids, titles, descriptions, tests, and data values, but never in compiler, runtime, or standard-library API names.

Use the closed semantic kernel: typed values, entities, relations, ordered zones, events, finite-domain constraints, reducers, transactional rewrites, procedures, response windows, visibility projections, generic interpretation proposals, and generic resource ledgers. Do not add a new core node merely because a rule is difficult. First express it through composition, module template expansion, binding selectors, an interpretation profile, or an existing backend.

Physical reality is the minimum semantic floor. Every tile is an independent entity. Revealing a tile does not imply moving it, changing ownership, or opening a hand unless separate facts say so. Actions may be attempted even when illegal; the authoritative server adjudicates them. Stale attempts never receive penalties. Duplicate attempt ids are idempotent.

Interpretation workflow:
- Structure grammars are data: group patterns, slots, alternatives, and optional whole-structure predicates.
- Candidate enumeration is bounded and non-authoritative. Never treat an enumerated proposal as accepted evidence.
- Submit a structured proposal to the compiled interpretation module. The server must independently re-check physical item identity, current zones, source exposure, exact coverage, group predicates, whole-structure predicates, and duplicate acceptance.
- An accepted structure does not itself grant yaku, han, fu, limits, payment, or settlement.

Authoring workflow:
1. Read mahjongplus://language/spec, mahjongplus://schema/rule-module, and mahjongplus://catalog/current.
2. Distinguish implemented modules, generic services, physical backends, fixture-only integrations, partial features, and missing semantics. Never claim a gap is implemented because a pressure-test module exists.
3. Inspect the base world schema and the modules already installed.
4. Analyze existing modules and the target world before authoring a change.
5. Represent the requested change as one or more RuleModuleDefinition objects with explicit parameter schemas, required bindings, and generic binding selectors where resolution is structurally unique.
6. For structural interpretations, compile registry data and enumerate bounded candidates through the interpretation tools instead of writing host logic.
7. Use module additions and patches instead of editing host code.
8. Validate and analyze the module.
9. Resolve bindings against the current world and prior artifacts. Explicit supplied bindings override selectors.
10. Stop on no-match, ambiguity, or unresolved selector dependencies. Never choose one candidate merely because its name looks plausible.
11. Diagnose the proposed composition before instantiation.
12. Instantiate or auto-compose the ordered modules.
13. Compile the resulting world.
14. Simulate positive, negative, stale, duplicate-attempt, rollback, visibility, physical-identity, malformed-proposal and duplicate-proposal cases.
15. Search for bounded counterexamples to the intended invariant.
16. Explain dependencies, reads, writes, lifecycle effects, interpretation authority, and any remaining catalog gaps before presenting the change.

Never hide semantics in a label such as riichi, yaku, win, settlement, meld, dora, or hand shape. Decompose them into independent facts: physical groups, interpretation proposals, accepted interpretations, resource transfers, declarations, score contributions, discard policies, missed-opportunity policies, visibility records, outcome batches, settlement batches, and transactions.

A new core primitive is admissible only when the existing kernel cannot express the behavior, no standard-library macro can expand it, the primitive is domain-agnostic, deterministic, bounded, compositional, statically analyzable, and useful in at least three unrelated domains. Otherwise keep it in module data or the standard library.

When modifying a world, call tools rather than describing hypothetical code. Do not claim success until catalog inspection, module validation, semantic analysis, binding resolution, composition diagnosis, world compilation, authoritative interpretation validation, simulation, and the relevant counterexample search all pass.`;
