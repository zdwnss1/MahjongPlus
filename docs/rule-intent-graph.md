# RuleIntentGraph

`RuleIntentGraph` is the semantic planning layer between natural-language rules and executable `RuleModuleDefinition` data.

It prevents a rule-authoring model from jumping directly from a label such as “riichi”, “yaku” or “win” to a large low-level module. The graph must name the independent semantics first:

- triggers;
- conditions;
- facts and state;
- effects and write channels;
- consumers and outcomes;
- scope, lifetime and visibility;
- ordering and conflict declarations.

## Compilation path

```text
natural language
→ RuleIntentGraph
→ validate / analyze
→ generic lowerings
→ RuleModuleDefinition
→ module validation / binding resolution
→ composition diagnosis
→ World Image
→ simulation / counterexample search
```

## Lowerings

The initial lowering vocabulary is deliberately small:

- `event-record`: append an event-derived record through a reducer;
- `state-reducer`: install a declarative reducer;
- `action-gate`: compile conditions into a constraint and patch an action requirement;
- `action-effects`: patch declarative effects into an action;
- `module-fragment`: a temporary migration bridge for existing modules.

A module fragment is not an opaque escape hatch. It must list every semantic node it realizes. The compiler embeds the graph hash, node map, edges, conflicts and diagnostics into module artifacts and metadata. This makes unexplained low-level behavior detectable and lets bridge fragments be replaced incrementally.

## Admission rules

- Graphs and lowerings must survive JSON round-trip.
- Every edge and lowering reference must resolve to a node.
- Condition, fact, state, effect and consumer node kinds are checked against their lowering recipe.
- Unlowered semantic nodes produce warnings; compilation errors prevent module generation.
- Conflict declarations name semantic write channels and composition policy.
- Compiled modules still pass the ordinary module validator and the full world toolchain.

## Current pressure catalog

The riichi preset now contains intent graphs for:

- Super riichi;
- Turbo riichi declaration;
- continuing multi-win flow;
- Stone on Three Years;
- Eight Consecutive Wins;
- a new third-discard private-reveal example.

Existing executable modules are initially represented through traceable module-fragment bridges. Their additions, patches, artifacts and auto-binding selectors are preserved exactly while their semantic decomposition becomes machine-readable. New rules should prefer generic lowering recipes and use fragments only when the current recipe library cannot yet express a piece of behavior.
