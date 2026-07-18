# MahjongPlus

A playable networked riichi mahjong MVP in which four seats first freeze a match constitution, then govern natural-language house-rule artifacts in East–South–West–North order, and finally play on an authoritative deterministic server.

## Implemented

- Public four-player rooms with reconnect tokens and bot fill.
- Random starting seats.
- Immutable constitution: Tenhou-like / M.LEAGUE-like profile, east-only / hanchan, starting score, bankruptcy, per-player rule slots, action timeout.
- Rule proposal, three-opponent voting, unanimous rejection, author confirmation, skip and skip-all.
- Safe `RuleCompilerPort`; the MVP rejects meta-rule mutations and stores accepted proposals as **non-executable** artifacts.
- Full normal riichi match flow via MIT-licensed `@kobalab/majiang-core`, with `@kobalab/majiang-ai` bots.
- Server-derived legal actions for human draw, discard, riichi, win, calls, kan, abortive draw, and pass.
- Private concealed-hand projection, disconnection timeout fallback, final scores, and next-match seat rotation.
- Responsive React table UI, tests, CI, and Docker build.

## Not implemented yet

Natural-language rules are not executed in this MVP. Typed MRIR, whole-pack conflict proof, and sandboxed Wasm are reserved behind the interfaces documented in `docs/rule-engine-roadmap.md`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Production:

```bash
npm run build
npm start
```

The production server serves the built frontend and Socket.IO on port `3000` by default.

## Tests

```bash
npm run typecheck
npm test
npm run build
```

## License

MahjongPlus is MIT licensed. Mahjong rules and AI execution are provided by the separately MIT-licensed Kobalab packages.
