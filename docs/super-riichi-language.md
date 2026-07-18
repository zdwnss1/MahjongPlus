# Super riichi language pressure test

This slice treats super riichi as a composition test rather than a new engine feature branch.

## Rule dimensions

The fixture parameterizes four independent dimensions:

- **action choice** — standard riichi or a 5000-point super declaration;
- **availability scope** — every player or only the rule owner;
- **indicator capacity** — four additional public indicators or no fixed cap;
- **physical reserve policy** — fixed dead wall or an extension of four physical tiles (two stacks) per super declaration.

The default super declaration reveals two additional public indicator records.

## Language impact

No new tile, dora, riichi or wall AST node is introduced.

The only new language-level contract is a closed, domain-independent data schema used to publish action forms and choices. Authoritative mode validation remains a normal calculus constraint, so clients cannot bypass it by sending an arbitrary string.

Everything else is expressed with existing world data and calculus:

- scope is a boolean constraint over `actorId` and a frozen rule owner;
- the 1000/5000 payment is a generic resource-ledger rewrite;
- the riichi pot is another account in that ledger;
- the indicator cap is a comparison against an ordered reveal-track component;
- public visibility is recorded as `{ tileId, audience: "all", source }` data;
- unbounded mode transfers the tail of `wall.live` to the head of `wall.dead` inside one rewrite transaction;
- physical slot identity survives the boundary migration, while zone ordinals are reindexed by the world store.

## Interpretation of “four”

The capped fixture interprets the requested normal upper limit as **four additional indicators on the shared dora reveal channel**. This is intentionally a policy value (`standardExtraIndicatorCap`) rather than an engine constant.

## Interpretation of unlimited extension

The unbounded fixture extends the dead wall on every super declaration. With the default values:

- two extra indicators are revealed;
- each indicator owns a two-tile physical span (public indicator plus companion tile);
- therefore four live-wall tail tiles become dead-wall tiles.

The values are independent policy fields, so a later rule may choose overflow-only extension or a different physical span without changing the core calculus.

## Current boundary

This is an executable fixture world, not yet an addition to the full riichi preset turn procedure. The next integration step is to attach the same action contract, constraint and rewrite to the eventual common riichi declaration procedure and shared dora reveal channel.
