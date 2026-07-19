# Mahjong rule language

The Mahjong rule language is the authoring layer above the closed world calculus. Concrete rules are JSON-serializable `RuleModuleDefinition` data. They are not TypeScript functions, runtime subclasses, capability registrations, or compiler branches.

## Compilation path

```text
RuleModuleDefinition data
  -> parameter and binding validation
  -> module-template expansion
  -> additions and patches applied to WorldSource
  -> closed-calculus validation
  -> canonical World Image and hash
  -> deterministic runtime adjudication
```

A module may contain:

- a parameter schema and defaults;
- required bindings into the target world;
- entities, zones, relations, actions, procedures and response windows to add;
- constraints, reducers and rewrites to add;
- patches to existing action requirements/effects, response effects or procedure-node effects;
- artifacts such as eligibility programs, award records or authoring metadata.

## Template vocabulary

Template nodes use the reserved `$module` field and are expanded before World Image compilation.

- `ref` reads parameters, bindings, locals, module metadata or world data;
- `template` interpolates strings;
- `entity-index` and `zone-index` resolve stable ids to normalized array paths;
- `concat`, `if`, `eq`, `not`, `map`, `filter`, `range`, `merge` and `arithmetic` provide bounded compile-time construction.

Template expansion is not runtime rule semantics. The expanded result must use only the frozen calculus vocabulary.

## Hard constraints

1. A module must survive `JSON.stringify` / `JSON.parse` without semantic loss.
2. Functions, classes, closures, symbols, bigint values, cycles and host objects are rejected.
3. Concrete rule names may occur in ids, titles, descriptions, tests and data values, but not in compiler, runtime or standard-library API names.
4. A rule cannot bypass authoritative action adjudication.
5. Physical tile identity, zone placement, ownership and visibility are independent facts.
6. Stale attempts cannot receive penalties, and duplicate attempt ids remain idempotent.
7. A new core primitive requires a domain-agnostic admission argument; difficulty of one Mahjong rule is not sufficient.

## MCP authoring flow

The MCP-shaped catalog exposes the following workflow:

1. `mahjong.schema.describe`
2. `mahjong.module.list` / `mahjong.module.read`
3. `mahjong.module.validate`
4. `mahjong.module.instantiate`
5. `mahjong.world.compose`
6. `mahjong.world.compile`
7. `mahjong.world.simulate`
8. `mahjong.world.find-counterexample`
9. `mahjong.world.explain`
10. `mahjong.world.dependencies` / `mahjong.world.diff`

The in-process `MahjongLanguageAuthoringSession` currently implements registry, read, validation, instantiation, composition and compilation. Runtime-dependent tools require an explicit `MahjongLanguageRuntimeAdapter`; they never silently claim execution.

## Current migration state

The five local-yaku pressure tests are now declarative modules in `RIICHI_RULE_MODULES`. Earlier Super and Turbo fixture builders are internal migration debt and will be replaced by module data using the same format. No second DSL will be introduced for action-heavy rules.
