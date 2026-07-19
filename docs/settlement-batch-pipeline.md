# Settlement batch pipeline

This slice turns a ready outcome batch into an atomic resource settlement without adding a win-specific runtime path.

## Layer separation

The pipeline keeps four durable record classes separate:

1. **Outcome batch** — authoritative adjudication output. It says which selected items occurred and in what order.
2. **Interpretation proposal** — one interpreter's explanation of one outcome item, including evidence and proposed transfer intents.
3. **Settlement batch** — an ordered composition of accepted proposals into one atomic transfer set.
4. **Settlement transaction** — evidence that the transfer set and lifecycle changes were committed together.

A win record is not a score proposal. A score proposal is not a committed payment.

## Explicit actions

The fixture exposes three system actions:

- `pipeline.interpret-outcome-item`
- `pipeline.compose-settlement`
- `pipeline.commit-settlement`

They are ordinary adjudicated actions. The configured settlement actor does not bypass constraints. Every action is journalled, revisioned, idempotent by attempt id, and transactional.

An automatic procedure may submit these actions later; automation is not part of their semantics.

## Progress batches

`createProgressBatchRewrite` is the generic primitive behind response and interpretation progress. It records:

- declared items;
- distinct processed keys;
- a source identifier;
- `collecting` or `ready` state.

The older response-batch macro is now a convenience wrapper that fixes the source field to `sourceWindowId`.

## Interpretation

The turbo fixture uses a deliberately simple fixed-transfer profile so the pipeline can be executed end to end:

- ron creates one payer-to-winner transfer;
- tsumo creates one transfer from each other seat to the winner.

These values are fixture parameters, not riichi scoring. A production interpreter will replace this module with hand interpretation, yaku, fu, limits, responsibility and payment-shape proposals without changing the batch consumer or ledger commit mechanism.

Each source item may be interpreted once. The interpretation progress batch becomes ready only after every outcome item has exactly one accepted proposal.

## Composition

Composition preserves the authoritative outcome-item order even when interpretation actions arrive in another order. It concatenates each ordered proposal's transfer intents into one settlement batch.

This is the boundary for future conflict policies such as:

- select all or select one proposal;
- reject incompatible proposal dimensions;
- allocate a shared claim to first, last, split or nobody;
- combine responsibility and ordinary payers;
- cap aggregate loss or allow a configured negative balance.

The current fixture selects all accepted proposals.

## Atomic ledger validation

`createSimpleLedgerTransferFeasibilityConstraint` evaluates the complete transfer set before mutation. For each account it computes:

```text
current balance - aggregate outgoing + aggregate incoming
```

and compares the result with the configured minimum balance.

Thus two payments that are individually affordable but jointly overdraw the payer are rejected as one batch.

`createSimpleLedgerTransferCommitRewrite` then updates every account in one world rewrite. A second rewrite marks the settlement committed, marks the outcome consumed, and appends a transaction record. Both rewrites are in the same action transaction, so later failure restores all balances and statuses.

## Continuation gate

Draw, discard and exhaustive-draw actions are blocked while any outcome batch is `collecting` or `ready`. They become available only when the settlement commit marks the source outcome `consumed`.

All-pass response windows create no outcome batch and therefore require no empty settlement.

## Closed-language invariant

This change adds no calculus node and no `WorldRuntime` branch. The standard-library helpers expand into the existing fixed vocabulary: filtering, mapping, quantification, arithmetic, aggregation and generic rewrites.

## Current boundary

The pipeline is executable and covers multi-ron and self-draw outcomes. The interpretation profile is intentionally synthetic. Production work still needs:

- hand-structure interpretation;
- yaku/fu/limit proposal generation;
- shared pot, honba and dealer-continuation policies;
- bankruptcy and match-end policies;
- a scheduler that submits ready pipeline actions automatically.
