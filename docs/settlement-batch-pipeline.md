# Declarative outcome-settlement modules

This slice turns a ready outcome batch into an atomic resource settlement without adding an outcome-specific runtime path or a rule-specific compiler function.

## Hard boundary

Concrete rules may export serializable module data only. Runtime and standard-library APIs may expose generic functions such as:

- `compileOutcomeSettlementPrograms`
- `composeOutcomeSettlementModule`
- `appendWorldModuleEntities`
- `createWorldEntityIndex`

A concrete rule name must not appear in a public function, compiler branch, capability id or standard-library macro.

The module profile supplies:

- record-track bindings;
- ledger binding;
- outcome item-key, subject and mode expressions;
- evidence relation shape;
- transfer-shape expressions;
- system actor, asset and minimum-balance policy;
- effect patches that connect an outcome producer to the generic consumer.

## Layer separation

The pipeline keeps four durable record classes separate:

1. **Outcome batch** — authoritative adjudication output. It says which selected items occurred and in what order.
2. **Interpretation proposal** — one interpreter's explanation of one outcome item, including evidence and proposed transfer intents.
3. **Settlement batch** — an ordered composition of accepted proposals into one atomic transfer set.
4. **Settlement transaction** — evidence that the transfer set and lifecycle changes were committed together.

An outcome record is not an interpretation proposal. A proposal is not a committed transfer.

## Module-owned storage

The outcome-settlement module appends its own system actor and record tracks to the world before bindings are compiled. The source rule model does not own:

- interpretation profiles;
- settlement actor ids;
- transfer amounts;
- settlement tracks;
- transaction storage.

This allows the same source rule world to be composed with a different interpreter, ledger policy or no settlement layer at all.

## Explicit actions

The module exposes three ordinary actions:

- `pipeline.interpret-outcome-item`
- `pipeline.compose-settlement`
- `pipeline.commit-settlement`

They are normal adjudicated actions. The configured system actor does not bypass constraints. Every action is journalled, revisioned, idempotent by attempt id and transactional.

An automatic procedure may submit these actions later; automation is not part of their semantics.

## Declarative interpreter profile

The interpreter is a data object. Its expressions use template variables such as `item`, `outcome`, `batchId` and `itemKey`. `compileOutcomeSettlementPrograms` substitutes those variables into the selected durable facts before producing closed calculus programs.

A test profile may declare, for example:

```text
when item.mode == "single-payer"
  produce one transfer from outcome.metadata.sourceActorId to item.actorId

when item.mode == "shared-payer"
  produce one transfer from each configured participant except item.actorId
```

The compiler does not know those mode names or transfer shapes.

Each source item may be interpreted once. The interpretation progress batch becomes ready only after every outcome item has exactly one accepted proposal.

## Composition

Composition preserves authoritative outcome-item order even when interpretation actions arrive in another order. It concatenates each ordered proposal's transfer intents into one settlement batch.

This is the boundary for policies such as:

- select all or one proposal;
- reject incompatible proposal dimensions;
- allocate a shared claim to first, last, split or nobody;
- combine several payer classes;
- cap aggregate loss or allow a configured negative balance.

## Atomic ledger validation

`createSimpleLedgerTransferFeasibilityConstraint` evaluates the complete transfer set before mutation. For each account it computes:

```text
current balance - aggregate outgoing + aggregate incoming
```

and compares the result with the configured minimum balance.

Thus two transfers that are individually affordable but jointly overdraw the payer are rejected as one batch.

`createSimpleLedgerTransferCommitRewrite` then updates every account in one world rewrite. A second rewrite marks the settlement committed, marks the outcome consumed and appends a transaction record. Both rewrites are in the same action transaction, so later failure restores all balances and statuses.

## Continuation gate

Configured actions are blocked while any outcome batch is `collecting` or `ready`. They become available only when settlement commit marks the source outcome `consumed`.

An event path that creates no outcome batch requires no empty settlement.

## Public API invariant

The package root exports only generic world, compiler and settlement APIs. Concrete rule fixture builders remain internal test scaffolding and are not public package functions. Tests reject local-rule names in the public index and in generic settlement source files.

## Current boundary

The generic pipeline is executable. Production work still needs declarative profiles for:

- physical-structure interpretation;
- contribution and limit proposal generation;
- shared resources and continuation policies;
- bankruptcy and match-end policies;
- a scheduler that submits ready pipeline actions automatically.
