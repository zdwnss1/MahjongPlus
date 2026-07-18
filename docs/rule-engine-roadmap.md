# Rule engine roadmap

The MVP intentionally records custom rules but does not execute them. The next implementation stage should add:

- Typed MRIR expressions and event subscriptions.
- Effect channels for legality, interpretation, flow, score, visibility, state, and termination.
- Whole-pack validation, overlap witnesses, cycle detection, deterministic random substreams, and resource budgets.
- A compiler model plus an independent critic model.
- A Wasm Component Model escape hatch with no filesystem, network, wall-clock, or ambient entropy imports.

The publication gate remains deterministic: vote outcome, author confirmation, type/capability validation, and whole-pack validation must all pass before an artifact becomes executable.
