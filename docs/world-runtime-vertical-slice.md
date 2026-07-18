# World runtime vertical slice

MahjongPlus treats Tenhou, M.LEAGUE, standard riichi, and future house-rule games as compiled world images rather than privileged engine modes.

## Delivery sequence

1. **World vocabulary** — stable entities, components, zones, relations, actions, events, effects, and procedures.
2. **World language** — serializable MWL definitions and deterministic compilation to an immutable `WorldImage`.
3. **World runtime** — transactional state changes, procedure tokens, revisioned action attempts, event journaling, and typed relations.
4. **Physical riichi preset** — tile instances, four wall sides, two-high stacks, dice opening, exact live/dead-wall orders, hands, and rivers.
5. **First executable loop** — deal, draw, discard, river placement, and rotation to the next player, all described by MWIR.
6. **Non-standard proof** — altered tile counts, uneven wall sides, arbitrary colored tiles, and signed per-tile score contributions use the same runtime.
7. **Integration** — once the vertical slice is stable, replace the legacy draw/discard authority in the room server and retain Kobalab only as a differential oracle.
8. **Expansion** — response windows, calls, kan, win-shape interpretation, yaku/fu, settlement, hand termination, and match termination become additional language modules.

## Current vertical slice

The slice added by this branch intentionally stops after normal draw/discard rotation. It proves that the following are data rather than TypeScript branches:

- which entities exist;
- how many copies of each tile exist;
- which concrete tile is red, gold, cursed, or carries a negative han contribution;
- how physical stacks are distributed across the four wall sides;
- how dice choose a break and derive live/dead-wall order;
- how thirteen-tile hands are dealt in `4,4,4,1` batches;
- which procedure token owns the normal draw opportunity;
- which requirements reject an out-of-flow attempt;
- how a concrete tile ID moves from wall to hand to a stable river slot;
- how the flow token rotates from East to South.

## Runtime authority

Normal opportunities are requirements, not hidden buttons. The action definitions `draw` and `discard` remain globally addressable. An attempt at the wrong procedure node is recorded as `action.attempted` and `action.rejected`; a successful attempt creates an action entity, relations, movement events, domain events, and a receipt.

## Package boundaries

- `@mahjongplus/world-model`: mutable world state with stable entities, zones, placements, and relations.
- `@mahjongplus/world-language`: MWL/MWIR types, structural validation, canonical serialization, and deterministic image hashing.
- `@mahjongplus/world-runtime`: procedure scheduler, expression evaluation, effect interpreter, transactions, journal, attempts, and receipts.
- `@mahjongplus/preset-riichi`: a particular initial world definition for the physical riichi setup and first turn loop.

No package imports the room server. The room server can later adopt the world runtime without making the generic world packages depend on Socket.IO, React, or Kobalab.

## Invariants tested

- The same seed produces the same `WorldImage` hash and wall order.
- Standard 136-tile setup produces 68 stacks, 14 dead-wall tiles, 70 live-wall tiles after dealing, and thirteen tiles per hand.
- Draw and discard operate on stable physical tile IDs.
- A discard creates a river placement and rotates the turn procedure to the next player.
- A mistimed action is rejected but remains part of event history.
- A 138-tile configuration and a red East carrying `-1 han` compile and run through the same code path.
