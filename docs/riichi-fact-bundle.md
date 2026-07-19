# Riichi as an atomic fact bundle

`riichi` is a user-facing label, not an indivisible runtime state.

A successful declaration action atomically publishes independent facts that share the same action/correlation id:

1. **Resource transfer** — asset, source account, destination account, and amount.
2. **Public declaration** — declaration type, audience, actor, and mode.
3. **Score contribution** — subject, dimension, operation, amount, evaluation stage, and lifetime.
4. **Discard policy** — the post-declaration selection restriction and its lifetime.
5. **Furiten policy** — the event that triggers a missed-win lock, resulting state, class, and lifetime.
6. **Reveal-track mutation** — public indicator records and any ordered-wall boundary migration.

These records are correlated but not semantically fused. A scoring system reads score-contribution facts without knowing how the stake was paid. Discard adjudication reads discard-policy facts without knowing the yaku value. Furiten adjudication reads trigger-based furiten policies without knowing whether the declaration was standard or super.

The event journal mirrors the bundle with generic events:

- `resource.transferred`
- `declaration.published`
- `score-contribution.granted`
- `discard-policy.activated`
- `furiten-policy.activated`
- `reveal-track.updated`

There is intentionally no authoritative `riichi.declared` mega-event. The action entity is the common cause, transaction boundary, and correlation identity.

## Composition consequences

A local rule may independently patch:

- the stake amount or destination;
- public/private declaration visibility;
- the score contribution or evaluation stage;
- drawn-tile-only, chosen-tile, or unrestricted post-declaration discards;
- temporary, same-turn, or hand-long missed-win consequences;
- indicator count, visibility, capacity, and wall migration.

Changing one module does not implicitly change the others.

## Current boundary

The fixture publishes executable fact records and journal events. The full common-riichi preset does not yet consume the discard and furiten policies during production turn/win adjudication, nor consume score contributions during final settlement.
