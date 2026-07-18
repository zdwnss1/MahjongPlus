# Response-window vertical slice

This slice extends the MWIR world runtime from a single-player draw/discard loop to simultaneous discard responses without giving standard riichi priority rules privileged TypeScript status.

## Flow

1. `discard` moves one concrete tile entity into the discarder river.
2. `tile.discarded` receives a stable event ID.
3. The turn procedure enters `await-response` instead of immediately rotating.
4. A response-window entity is opened and related to the source event and physical tile.
5. Every non-discarding player may submit one of the response actions defined by the selected world image.
6. Once every participant has submitted, the configured resolver selects the highest non-empty priority tier.
7. Selected submissions run their MWIR effects in the selected actor context.
8. All selection effects and the closing submission share one transaction and one rollback boundary.

Normal riichi currently supplies these data:

- `ron`: highest tier, multi-select, ordered by turn distance from the discarder;
- `open-kan` and `pon`: next tier, single-select, nearest claimant wins ties;
- `chi`: lower tier, single-select and additionally constrained to the next player;
- `response.pass`: no claim.

Changing this ordering is a world-image patch rather than a runtime branch.

## Call validation

The window manager only deals with participation and resolution. Tile composition remains ordinary requirements:

- all referenced physical tile IDs must actively occupy the caller hand;
- tile IDs must be distinct;
- pon and open kan require the same `tile.baseFace` as the source discard;
- chi requires a common `tile.suit` and three consecutive `tile.rank` values;
- ron currently requires a `can-win-on` relation produced by a future win-interpretation module.

This keeps the generic window runtime independent from mahjong hand semantics.

## Meld and river facts

A selected chi, pon or open kan:

- creates a stable `meld` entity;
- claims the exact source tile from its river slot;
- leaves the source river entry as a `claimed` tombstone with the claiming action ID;
- moves the caller physical hand tiles into an exposed meld-tile zone;
- connects the meld entity to every participating tile;
- emits `meld.committed` with the source discard event in its objects;
- transfers the turn procedure to the caller.

The river tombstone is historical topology, not an active second location. Active zone queries exclude claimed and removed entries.

## Atomicity

The runtime snapshots:

- world entities, zones and relations;
- procedure tokens;
- event journal length;
- response-window submissions and resolution state.

If the last response selects a call whose effects fail, the closing submission returns `invalid` and all response resolution changes are rolled back. Earlier valid submissions remain present, allowing the player to repair the state or submit another closing response.

## Current boundary

This slice does not evaluate complete winning shapes or settle ron scores. It records selected ron claims and moves the turn procedure to `await-win-resolution`. The next slice will language-define win interpretation, yaku/fu contributions and settlement proposals.
