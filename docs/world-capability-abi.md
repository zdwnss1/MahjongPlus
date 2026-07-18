# World capability ABI

MahjongPlus must not add a dedicated AST branch every time a rule mentions a new hand shape, score dimension, random mechanism, spatial query, or process operation. MWL therefore separates the stable language kernel from a discoverable capability catalog.

## Principle

A capability is a versioned deterministic operator with:

- an input and output JSON Schema;
- a kind (`query`, `constraint`, `reducer`, or `generator`);
- declared reads and writes;
- purity and deterministic guarantees;
- resource budgets;
- a stable descriptor hash.

A `WorldImage` pins the capability id, version, and descriptor hash. Compilation rejects undeclared calls, unavailable implementations, or descriptor drift. Runtime integration may only use a local registry satisfying the frozen manifest.

## MCP shape

The same registry exports:

- MCP-shaped tool descriptors for compiler agents and structured editors;
- descriptor resources under `mahjongplus://capabilities/...`;
- the exact frozen hashes used by world compilation.

MCP is a discovery and authoring surface, not a live authority path. A running hand never calls a remote MCP server, LLM, network service, wall clock, or ambient random source.

## Generic counterexamples

### Arbitrary hand grouping

`core.partition.exact-cover` receives attributed entities, counted group slots, alternative group sizes, and predicates such as `all-equal` or `consecutive`. It does not know the words hand, meld, sequence, triplet, quad, or pair.

The test suite expresses a form containing:

- three groups of four entities, each either four equal faces or four consecutive ranks in one suit;
- one group of two equal faces.

Changing this to five groups of two, two groups of six, mixed group arities, or a non-mahjong exact-cover problem changes only data.

### Signed score contributions and minimum thresholds

`core.numeric.pipeline` reduces arbitrary named dimensions through explicit stages. Contributions may add, multiply, set, minimize, or maximize values. Constraints run after named stages.

A positive contribution, a negative tile contribution, and a later minimum threshold are therefore data in one pipeline. The operator does not know `han`, yaku, one-han minimums, or mahjong scoring.

## Next runtime step

`capability-call` is now a first-class MWL value expression and capability manifests are frozen into `WorldImage`. The next small slice will wire the same expression into runtime constraint evaluation and generator-produced MWIR effects. Generator capabilities return declarative effects; they never mutate world state directly.
