# Closed world calculus

MahjongPlus rules compile to a small, closed semantic kernel. New house rules may add data, modules, macros, tests, and optimized compiler backends, but they must not add runtime primitives merely because a new hand shape, score rule, or temporal condition appears.

## Core semantic forms

The kernel contains only:

- immutable values, variables, paths, lists and records;
- arithmetic and comparisons;
- finite collection filter/map/concat/flatten/distinct;
- count/sum/min/max aggregates;
- boolean composition and finite `exists` / `forall`;
- finite-domain variables and constraints;
- ordered-event reducers with simultaneous state updates;
- atomic JSON/document graph rewrites.

It contains no concepts named tile, meld, hand, yaku, han, riichi, dealer, win, or settlement.

## Standard-library macros

A macro improves authoring ergonomics but must expand into the closed core AST. `partition` is the first example. A pattern such as three groups of four plus a pair expands into one finite variable per item, finite group-instance domains, cardinality constraints, and user-supplied formulas over each selected member collection.

The optimized partition search is a compiler backend. The semantic artifact remains the expanded finite-domain program.

## Event history

Temporal rules are event reducers or quantified queries over ordered event records. A consecutive-win counter is not a new primitive; it is an ordinary reducer that reads each event and updates generic state.

## Numeric stages

Signed contributions and thresholds are ordinary records, collection filters, sums, and comparisons. Stage names and ordering are world data. There is no permanent `negative-han`, `fan-minimum`, or `score-pipeline` semantic node.

## Capability ABI

The capability ABI remains an escape hatch for algorithms that genuinely cannot be expressed or efficiently lowered from the closed calculus. `core.partition.exact-cover` and `core.numeric.pipeline` are retained temporarily for compatibility, but their primary semantics now live in calculus/macros and compiler backends rather than as required runtime operators.

## MCP surface

MCP exposes five language-level tools only: `core.evaluate`, `core.solve`, `core.reduce`, `core.rewrite`, and `core.expand`. It does not expose one tool per local rule or per convenience operation. A running hand never calls MCP remotely.

## Admission rule for new core syntax

A new core node is allowed only when it cannot be expressed by current syntax, cannot be a macro, is domain-independent, has deterministic total semantics, supports static cost analysis, and has several non-mahjong use cases.
