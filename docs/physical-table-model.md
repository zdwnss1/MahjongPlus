# Physical table, entity graph, and wall topology

MahjongPlus treats a real four-player table as the minimum capability floor. The server may add virtual mechanisms, but it must not erase actions, physical identity, spatial layout, or provenance that can exist at a hand-built table.

## 1. Everything important has an identity

The following objects receive stable IDs and may be related through typed edges:

- physical tile instances and tile prototypes;
- action attempts and committed actions;
- adjudications, effects, and domain events;
- players, rules, bindings, zones, river slots, wall stacks, and dice rolls.

The relation graph records immutable facts such as:

- an action targets a tile;
- a call responds to a discard event;
- an event was caused by an action;
- a tile moved from a hand to a river slot;
- a river tile was claimed by a meld action;
- a tile carries an active binding.

Historical relations do not execute code. Active bindings are stored separately and may subscribe to future events, produce typed effects, expire, or consume charges.

## 2. Tile appearance is not tile score

A tile prototype separates:

- `baseFace`: physical identity such as `m5` or `z1`;
- `engineFace`: temporary encoding used by a legacy adapter;
- appearance: red, gold, material, glyph, labels;
- traits: semantic tags;
- active bindings and scoring contributions.

Therefore any tile can be red, including honors and non-five number tiles. Red is only appearance/trait data. A rule may bind `+1 han`, `0 han`, or `-1 han` to the same tile, optionally only in a context such as ron, tsumo, winning tile, or closed hand.

Qualification and scoring are separate phases. A negative han contribution does not implicitly decide whether the hand still satisfies the one-yaku requirement; that ordering is a rule-pack decision.

## 3. Wall topology

A physical wall is not represented as one shuffled array. It is represented as:

- four sides owned by seats;
- ordered stacks counted from the right edge of the player in front of that wall;
- an explicit stack height, normally two;
- a physical circular traversal order;
- a dice roll entity;
- a counted break stack, live-wall cursor, and exact dead-wall tile interval.

For the standard 136-tile game, two-high stacks produce 68 stacks and 17 stacks per side. The standard opening uses two dice: the total selects the wall by counting from the dealer in turn order, and the same total counts stacks from the selected wall's right edge. The next stack begins the live wall; the dead wall is the exact configured number of tiles immediately before that cursor in the circular topology.

### Changing the tile count

Changing the number of tiles does not change the meaning of the dice or the direction of drawing.

1. Compute the number of physical stacks from tile count and stack height.
2. Distribute stacks by an explicit policy:
   - balanced from East;
   - balanced from the dealer;
   - exact per-side counts.
3. Select the nominal wall from the dice exactly as usual.
4. Count the dice total from that wall's right edge. If a deliberately short custom wall is exhausted, counting continues around the physical ring instead of inventing a new rule.
5. Reserve the configured dead-wall size as an exact number of tile positions. In virtual mode this may split a partial stack; strict physical mode may forbid partial stacks or odd tile counts.

This keeps `where to break` and `which direction to draw` stable while allowing five copies, six copies, extra red variants, different dead-wall sizes, or deliberately uneven walls.

## 4. River topology

A river is a spatial zone, not only a list of faces. Each discard creates a stable river slot with:

- owner, ordinal, row, column, stack level, and orientation;
- the exact tile instance;
- the discard event;
- occupied, claimed, or removed state;
- the action that claimed it, when applicable.

A called discard moves into a meld, but its river slot remains as a historical tombstone. Riichi orientation, unusual stacking, alternative row lengths, and rule-created river layouts are layout policies rather than special cases in hand logic.

## 5. Binding examples

- Tile → event: a binding carried by a red East triggers when that exact tile is discarded.
- Event → tile: a reveal event targets one hidden physical tile.
- Action → tile: discard, riichi, swap, mark, and call actions target tile IDs.
- Action → event: ron, chi, pon, and kan attempts respond to a specific discard or kan event ID.
- Event → action: a committed event records the action that caused it.
- Event → event: derived events preserve causal ancestry.
- Binding → tile/action/event: a rule attachment may be hosted by any entity and can inspect later related events.

Bindings never mutate historical events. They emit new effects or events into the deterministic queue, with explicit visibility, lifetime, charge count, source rule, and resource budget.

## 6. Relation and binding separation

The relation graph and attachment registry deliberately remain separate:

- relations answer what happened and how entities are connected;
- attachments answer what remains active and may trigger later.

For example, `action A targets tile T` is an immutable relation. `tile T carries a one-charge binding that emits -1 han when the causing action commits` is an active attachment. Consuming the attachment does not remove or rewrite the historical action-to-tile relation.
