# Architecture

MahjongPlus separates four authority layers:

1. **Runtime kernel** — Socket ordering, private views, timeouts, event replay boundaries.
2. **Match constitution** — Base profile, east/hanchan length, starting score, bankruptcy, and rule-slot count. Immutable during a match.
3. **Base riichi profile** — Versioned Tenhou-like or M.LEAGUE-like parameters translated to `@kobalab/majiang-core`.
4. **Player rule pack** — Ordered artifacts produced during governance. The MVP compiler deliberately emits non-executable artifacts; the integration boundary is already explicit.

## Rule compiler boundary

`RuleCompilerPort.compile()` receives the frozen constitution, all earlier artifacts, author, slot, and natural-language text. A future implementation can return typed MRIR or a sandboxed Wasm component. It cannot modify the constitution or earlier artifacts.

## Authoritative game

The server owns `Majiang.Game`. Human players are represented by `RemotePlayer`, which derives legal replies from the same core methods used by AI players. The browser receives a projected snapshot: only its own concealed hand is included.

## Governance semantics

- Starting seat order is random.
- Order is East → South → West → North; each player may skip one slot or all remaining slots.
- A proposal is rejected politically only when all three non-authors vote reject.
- Technical rejection does not consume the slot.
- Earlier artifacts are immutable.
- Once frozen, the game runtime never calls an LLM.
- With an unchanged roster, the next match rotates starting seats so the previous South becomes East.
