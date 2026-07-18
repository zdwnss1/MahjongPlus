# Rule engine roadmap

The MVP records custom rules but does not yet execute natural-language rule programs. The repository now contains the physical-table and adjudication boundaries required before MRIR can safely become executable.

## Implemented foundations

- Open action attempts: normal engine opportunities are hints, not an authorization whitelist.
- Revisioned, idempotent action receipts with typed violations and constitutional penalties.
- Stable physical tile-instance IDs and configurable tile counts.
- Deterministic named random streams and seeded walls.
- Typed entity relation graph connecting tiles, actions, events, effects, zones, rules, and bindings.
- Active attachments hosted by any entity, with event matching, visibility, lifetime, and charges.
- Tile appearance separated from effective identity and scoring contribution; any tile may be red and contextual contributions may be negative.
- Spatial river slots that retain provenance after a discard is claimed.
- Physical four-sided wall topology with two-high stacks, dice-selected opening, configurable side distribution, exact dead-wall interval, and variable tile counts.
- Ordered rule-module adjudication hooks.

## Next: local rule-aware riichi kernel

Vendor the MIT Kobalab core into `packages/riichi-kernel` and preserve its license. Keep upstream as a test oracle. Split the local engine into:

1. physical state, zones, slots, and entity relations;
2. action attempt intake;
3. normative requirements and violations;
4. active binding matching;
5. effect proposal and resolution;
6. atomic event commit;
7. win-shape interpretation;
8. qualification, han, fu, limit, and settlement phases;
9. flow and termination;
10. projected player views.

No-player-rule runs must produce the same outcome as upstream for the same wall and action trace.

## MRIR v0.1

Add typed expressions and subscriptions for:

- `action.attempted`, `action.rejected`, `action.committed`;
- `violation.committed`, `penalty.committed`;
- draw, discard, call, riichi, kan, dora, win, settlement, hand end;
- entity selectors and relations between tiles, actions, and events;
- bindings with lifetime, visibility, and charges;
- legality requirements and explicit waivers;
- score transfer/mint/burn;
- rule-local state with event/turn/hand/match scopes;
- additive or negative han, yakuman, fixed fu, minimum limit;
- bounded flow effects such as extra draw and extra dora reveal;
- wall and river layout patches through explicit topology policies.

Whole-pack validation must include exclusive-write conflicts, overlap witnesses, dependency cycles, event-depth budgets, attachment charge bounds, and deterministic random substreams.

## Compiler order

1. Handwritten MRIR tests.
2. Structured rule editor producing the same MRIR.
3. LLM compiler producing canonical prose + MRIR.
4. Independent critic and counterexample generation.
5. Author confirmation.
6. Sandboxed Wasm only for rules outside the stable MRIR ABI.

An LLM never participates in a running hand and never receives authority to expand host capabilities.
