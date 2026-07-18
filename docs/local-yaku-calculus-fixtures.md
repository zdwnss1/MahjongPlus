# Local-yaku calculus fixtures

These fixtures pressure-test the closed world calculus with five heterogeneous local rules. They are data builders and tests, not new runtime operators.

## Included fixtures

- Open nine gates: fourteen same-suit tiles satisfying the `1112345678999 + one extra` lower bounds, with an open-hand condition and a configurable two-han award.
- Low-sum manzu flush: an accepted winning hand consisting only of manzu whose rank sum is at most a configurable threshold, with a thirteen-han/yakuman award.
- Stone on three years: a prior double-riichi event plus a last-live-wall win. River-bottom ron is a parameter because common descriptions disagree on whether it is included.
- Thirteen misfits: dealer initial hand or nondealer first draw, no calls, exactly one pair, no other duplicate/triplet, and no same-suit distance-one/two pair. Yakuman versus mangan and exclusion of the thirteen-orphans shape are parameters.
- Eight consecutive wins: an event reducer counts consecutive wins; draw reset and whether the eighth win must independently satisfy the ordinary yaku threshold are parameters.

## Architectural invariant

Adding these fixtures changes only preset data, macro composition, and tests. It does not add:

- a new core-expression kind;
- a rule-specific capability;
- a new WorldRuntime hook;
- a new state mutation primitive.

The tests enumerate every `kind` used by the five fixtures and assert that all belong to the existing closed calculus vocabulary.

## Source-definition variance

The fixture parameters preserve known local-rule variation instead of silently choosing one version:

- Stone on three years is commonly described as double riichi plus haitei, while other local-rule references also admit houtei.
- Thirteen misfits is variously scored as yakuman or mangan, and its exact “unconnected” boundary is table-defined.
- Eight consecutive wins varies on draw interruption, continued entitlement after the eighth win, and whether the eighth win must already satisfy the normal yaku requirement.

## Boundary

These files prove language expressibility. They are not yet attached to a production win-evaluation procedure or score settlement pipeline. That integration will consume the same eligibility programs and award records without changing the closed kernel.
