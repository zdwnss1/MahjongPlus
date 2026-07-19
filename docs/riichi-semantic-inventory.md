# Riichi semantic inventory

The machine-readable source of truth is `RIICHI_SEMANTIC_CATALOG`.

Its purpose is to prevent three different claims from collapsing into one:

1. a generic language or runtime service exists;
2. a rule module is executable in a pressure-test world;
3. the rule is integrated into the current common riichi profile.

These are separate statuses.

## Implemented physical backend

`createRiichiPhysicalWorldSource` deterministically creates independent tile entities, arbitrary tile copies and variants, dice evidence, physical wall stacks, live/dead ordered zones, and stack-to-tile relations.

It does not create deal, turn, call, win, scoring, or settlement rules.

## Implemented common-flow module

`riichi.common-flow` installs the current deal, draw, discard, pass, preliminary ron claim, pon, chi, and open-kan procedures over the physical world.

A `win.claimed` event is only an authoritative claim. It is not hand interpretation, yaku evaluation, scoring, or payment.

## Executable pressure-test modules

The catalog marks local-yaku eligibility modules, Super riichi, Turbo declaration, and continuing multi-win as `fixture-only` where appropriate. Their calculus programs execute, but their production consumers or surrounding standard rules are incomplete.

## Implemented generic services

The language authoring service validates, analyzes, resolves bindings, diagnoses compositions, instantiates modules, compiles World Images, and produces manifests.

The runtime validation service simulates revisioned attempts, preserves stale and duplicate-attempt semantics, explains outcomes, reports dependencies, diffs World Images, and searches bounded counterexamples.

The outcome-settlement service creates interpretation proposals, ordered settlement batches, aggregate ledger checks, and atomic transactions. It does not supply riichi hand interpretation or payment formulas.

## Current standard-profile gaps

The catalog explicitly records missing or partial production semantics, including:

- ordinary riichi declaration and its consumers;
- authoritative hand/wait interpretation;
- registered yaku evaluation;
- fu, limits, and payment shapes;
- standard settlement, honba, pot, and dealer continuation;
- discard/furiten policy consumers;
- the full kan family and replacement draw;
- dora/ura/kan-dora consumption;
- exhaustive and abortive endings;
- round and match lifecycle;
- penalty policy;
- complete observation projections.

An LLM author must inspect this catalog before modifying a world. A pressure-test module is evidence that the language can express a behavior; it is not evidence that the common production profile already supplies every dependency.
