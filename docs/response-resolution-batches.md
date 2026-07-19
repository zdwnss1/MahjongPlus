# Fact-driven response resolution batches

This slice removes the remaining fixture-level dependency on repeated idempotent procedure transitions after a multi-selection response window.

## Principle

A response window does not need a privileged runtime finalizer. Continuation and batch completion can be represented by ordinary world facts:

1. The procedure token is moved optimistically to its next state when the exposure is created.
2. Actions in that next state require a generic `no open response windows` constraint.
3. Each selected response executes the same batch-progress rewrite.
4. The first selected item creates one batch record.
5. Later selected items append distinct processed keys.
6. The batch becomes `ready` when processed-key count reaches selected-item count.

The authoritative continuation condition is therefore visible in the world graph rather than hidden in a runtime callback.

## Standard-library macros

`createNoOpenResponseWindowsConstraint` rejects continuation while any response-window entity has state `open`.

`createResponseBatchProgressRewrite` is safe to execute once per selected item. It creates or updates a generic record containing:

- batch id and kind;
- source window id;
- ordered selected items;
- distinct processed keys;
- `collecting` or `ready` state;
- caller-defined metadata.

Neither macro contains tile, win, settlement, or mahjong concepts.

## Turbo-riichi application

The turbo-riichi fixture now:

- advances the turn token to the next player's `await-draw` state before opening the win window;
- blocks draw and exhaustive-draw actions while the window remains open;
- records every selected winner as before;
- updates one `continuing-win` response batch once per winner;
- exposes a `ready` batch after all winners have been recorded;
- creates no batch for an all-pass window.

## Why this is lower-level than a finalizer hook

A runtime finalizer would add a new lifecycle privilege that every future workflow would have to route through. The fact-driven design instead uses the already frozen calculus, entity graph, and action requirements. Batch state can be queried, audited, replayed, rolled back, and consumed by a later settlement procedure without adding another WorldRuntime branch.

## Boundary

A later settlement processor may consume `ready` batches and produce proposals/payments. This slice deliberately stops at a durable batch fact and does not implement mahjong scoring or money transfer policy.
