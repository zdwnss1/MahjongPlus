# Semantic event, entity, and position binding language

Concrete rules must not depend on storage paths such as `event.payload.callType`, `world.zones[n].entries`, or a preset-specific relation layout.

A rule instead declares:

- semantic event classes, such as `meld-committed` or `declaration-published`;
- named event bindings and their semantic properties;
- entity and tile properties, such as `face`, `rank`, or `terminal-or-honor`;
- physical position predicates over a tile, zone kind, zone id, entry state, and ordinal;
- relation bindings;
- event ordering, causal-action equality, and interval exclusions;
- module parameters, module bindings, action parameters, and normalized context fields;
- applicable source modes, so response-only and direct-only rules compile into separate evaluation programs.

A `SemanticBindingProfile` maps those names to one concrete World Image schema. Replacing the profile may change event types, payload fields, entity components, or zone layouts without rewriting rule predicates.

Event classes are filtered before semantic quantification. A sequence over `pon → chi → kan` therefore ranges over three indexed event subsets rather than repeatedly traversing the entire journal.

Compilation remains deterministic:

```text
semantic rule data
→ binding profile expansion
→ closed CoreFormula/CoreExpression
→ ordinary RuleModuleDefinition
→ World Image compilation
```

The semantic layer does not execute at runtime and does not introduce callbacks or target-specific operators.
