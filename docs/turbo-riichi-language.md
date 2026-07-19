# Turbo riichi language slice

This slice models turbo riichi without adding a turbo-specific runtime branch or calculus node.

## Declaration proof

The declaration accepts three exact physical tile ids. The frozen constraint requires:

- the declarer owns all three tiles in the active hand zone;
- the ids are distinct;
- all three effective faces are equal;
- the common face is `m7`, `p7`, or `s7`;
- the hand was closed before declaration;
- the selected entities were not already public.

The tiles remain in the hand. Public disclosure is an independent visibility fact and does not create a meld or silently change ownership.

## Policy fan-out

One declaration atomically creates four subject-scoped discard policies:

- the declarer receives the ordinary riichi latest-draw policy;
- the other three players receive the turbo-riichi latest-draw policy.

The ordinary discard action consumes these policy facts through a closed-calculus constraint. There is no `if turboRiichi` branch in the runtime.

## Continuing wins

Every discarded tile opens the existing all-selection response window. All accepted claims create independent win records. A selected win does not enter a terminal hand procedure.

Before the window opens, the turn token is assigned to the next player in `await-response`. Every selected claim transitions the same token to `await-draw`; repeated transitions are idempotent in this fixture, so multiple winners advance the turn only once in observable state.

A player may also record a self-draw win. The token remains in `await-discard`, so the player must still discard and play continues.

## Optional limit

`maxWinsPerPlayer` is either `null` or a positive integer. It is enforced by counting generic win records for the claiming subject. One player reaching the limit does not prevent other players from winning.

## End condition

Wins do not terminate the hand. `end-exhaustive-draw` is available only when the live-wall zone is empty and transitions the turn procedure to `complete`.

## Current boundary

This is an executable WorldRuntime fixture. The win records do not yet run the production hand interpreter, yaku evaluation, point settlement, honba, or dealer-continuation logic. The common-riichi preset also does not yet consume subject-scoped policy facts globally; the fixture's discard action demonstrates that consumption path.

A production response-window finalizer is still desirable. It would run exactly once after all selected effects and replace the fixture's intentionally idempotent repeated transition.
