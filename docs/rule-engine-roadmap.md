# Rule engine roadmap

## Completed foundation

- Open `ActionAttempt` protocol rather than a legal-action whitelist.
- Typed `ActionReceipt`, violations, penalties, revisions, and idempotency.
- Always-available physical action catalog.
- Stable physical tile-instance identities.
- Deterministic named random streams and deterministic walls.
- Modular tile definitions supporting extra copies and extra red tiles.
- Ordered `ActionRuleModule` boundary.
- Frozen constitutional foul policy.

## Next: local rule-aware riichi kernel

Vendor the MIT Kobalab core into `packages/riichi-kernel` and preserve its license. Keep upstream as a test oracle. Split the local engine into:

1. physical state and locations;
2. action attempt intake;
3. normative requirements and violations;
4. effect proposal and resolution;
5. atomic event commit;
6. win-shape interpretation;
7. yaku/fu evaluation;
8. settlement;
9. flow and termination;
10. projected player views.

No-player-rule runs must produce the same outcome as upstream for the same wall and action trace.

## MRIR v0.1

Add typed expressions and subscriptions for:

- `action.attempted`, `action.rejected`, `action.committed`;
- `violation.committed`, `penalty.committed`;
- draw, discard, call, riichi, kan, dora, win, settlement, hand end;
- legality requirements and explicit waivers;
- score transfer/mint/burn;
- rule-local state with event/turn/hand/match scopes;
- additive han, yakuman, fixed fu, minimum limit;
- bounded flow effects such as extra draw and extra dora reveal.

Whole-pack validation must include exclusive-write conflicts, overlap witnesses, dependency cycles, event-depth budgets, and deterministic random substreams.

## Compiler order

1. Handwritten MRIR tests.
2. Structured rule editor producing the same MRIR.
3. LLM compiler producing canonical prose + MRIR.
4. Independent critic and counterexample generation.
5. Author confirmation.
6. Sandboxed Wasm only for rules outside the stable MRIR ABI.

An LLM never participates in a running hand and never receives authority to expand host capabilities.
