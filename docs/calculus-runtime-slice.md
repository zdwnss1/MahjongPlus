# Closed calculus runtime wiring

This slice connects the frozen `corePrograms` stored in a `WorldImage` to the authoritative world runtime through exactly three generic hooks.

## Fixed hooks

1. `core.constraint` is an action requirement. The referenced finite-domain program receives the standard action/world environment and passes only when it is satisfiable.
2. Every committed runtime event is fed to every frozen event reducer. Reducer states are deterministic derivatives of the append-only event journal.
3. `core.rewrite` is an action effect. It rewrites a normalized `{ world: WorldStateSnapshot }` document, which is reconstructed and validated before replacing live state.

These hooks are domain independent. They do not name tiles, hands, yaku, scoring dimensions, dealer state, or any local rule.

## Standard evaluation environment

Constraint and rewrite programs receive:

- actor, attempt and action identifiers;
- action parameters;
- current procedure token and response-window context when present;
- current revision;
- a normalized world snapshot;
- append-only runtime events;
- all reducer states.

Reducers receive ordered events plus their own prior state through the closed calculus reducer semantics.

## Atomicity

Action transactions now checkpoint:

- entity/zone/relation state;
- procedure scheduler;
- event journal;
- response windows;
- calculus reducer states.

If a rewrite or any later selected effect fails, all post-attempt changes roll back together. The attempted action remains historical, matching the reality-floor action model.

## Boundary

This slice wires the closed calculus into runtime authority. It does not yet translate the existing convenience requirements (`entities-component-equal`, etc.) into calculus programs, nor does it add the requested local-yaku fixtures. Those fixtures can now be added as data without changing runtime hooks.
