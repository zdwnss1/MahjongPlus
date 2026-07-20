from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Missing migration target: {label}")
    return text.replace(old, new, 1)


query = Path("packages/world-language/src/semanticQuery.ts")
text = query.read_text()
text = replace_once(
    text,
    """  const source = compileSemanticCollection(collection, profile, environment, bound);
  const variableName = safeVariable(bind);
  const next = {
    ...bound,
    [bind]: { domain, expression: variable(variableName) },
  };
  const itemPredicates = [
    eventClassCondition(bind, eventClass, profile, next),
    where ? compileSemanticCondition(where, profile, environment, next) : undefined,
  ].filter((entry): entry is CoreFormula => Boolean(entry));
""",
    """  const rawSource = compileSemanticCollection(collection, profile, environment, bound);
  const variableName = safeVariable(bind);
  const next = {
    ...bound,
    [bind]: { domain, expression: variable(variableName) },
  };
  const classPredicate = eventClassCondition(bind, eventClass, profile, next);
  const source: CoreExpression = classPredicate
    ? { kind: 'filter', source: rawSource, as: variableName, where: classPredicate }
    : rawSource;
  const itemPredicates = [
    where ? compileSemanticCondition(where, profile, environment, next) : undefined,
  ].filter((entry): entry is CoreFormula => Boolean(entry));
""",
    "semantic event-class prefilter",
)
query.write_text(text)

registered = Path("packages/world-language/src/semanticRegisteredContribution.ts")
text = registered.read_text()
text = replace_once(
    text,
    """export interface SemanticRegisteredEligibilityRule {
  id: string;
  title?: string;
""",
    """export interface SemanticRegisteredEligibilityRule {
  id: string;
  title?: string;
  sourceModes?: string[];
""",
    "registered rule source modes",
)
text = replace_once(
    text,
    """  semanticProfile: SemanticBindingProfile;
  rules: SemanticRegisteredEligibilityRule[];
}""",
    """  semanticProfile: SemanticBindingProfile;
  sourceMode?: string;
  rules: SemanticRegisteredEligibilityRule[];
}""",
    "evaluation source mode",
)
text = replace_once(
    text,
    """  const rules = definition.rules.map((rule) => ({""",
    """  const selectedRules = definition.rules.filter((rule) =>
    !definition.sourceMode || !rule.sourceModes || rule.sourceModes.includes(definition.sourceMode));
  const rules = selectedRules.map((rule) => ({""",
    "source mode rule partition",
)
text = replace_once(
    text,
    """    semanticQueryRuleIds: definition.rules.map((rule) => rule.id),""",
    """    semanticQueryRuleIds: selectedRules.map((rule) => rule.id),
    semanticSourceMode: definition.sourceMode,""",
    "selected semantic rule metadata",
)
registered.write_text(text)

ix3 = Path("packages/preset-riichi/src/ix3FirstTenLocalYaku.ts")
text = ix3.read_text()
for old, new, label in [
    ("title: '自摸セン',", "title: '自摸セン',\n    sourceModes: ['direct'],", "tsumo-sen source mode"),
    ("title: 'ブンブン立直',", "title: 'ブンブン立直',\n    sourceModes: ['direct'],", "bunbun source mode"),
    ("title: '燕返し',", "title: '燕返し',\n    sourceModes: ['response'],", "tsubame source mode"),
    ("title: '書込',", "title: '書込',\n    sourceModes: ['direct'],", "kakikomi source mode"),
    ("title: 'ポンチーカンロン',", "title: 'ポンチーカンロン',\n    sourceModes: ['response'],", "ordered call source mode"),
]:
    text = replace_once(text, old, new, label)
text = replace_once(
    text,
    """    semanticProfile: RIICHI_SEMANTIC_BINDING_PROFILE;
""" if False else """    semanticProfile: RIICHI_SEMANTIC_BINDING_PROFILE,
    interpretationTrackId: 'track:hand-interpretations',""",
    """    semanticProfile: RIICHI_SEMANTIC_BINDING_PROFILE,
    sourceMode: 'response',
    interpretationTrackId: 'track:hand-interpretations',""",
    "response evaluation source mode",
)
text = replace_once(
    text,
    """    semanticProfile: RIICHI_SEMANTIC_BINDING_PROFILE,
    interpretationTrackId: 'track:direct-hand-interpretations',""",
    """    semanticProfile: RIICHI_SEMANTIC_BINDING_PROFILE,
    sourceMode: 'direct',
    interpretationTrackId: 'track:direct-hand-interpretations',""",
    "direct evaluation source mode",
)
ix3.write_text(text)

tx = Path("packages/world-language/src/transactionalFactActions.ts")
text = tx.read_text()
text = replace_once(
    text,
    """    const transferRecords = list(...transfers.map((transfer) => record({
      from: transfer.from,
      to: transfer.to,
      amount: transfer.amount,
    })));""",
    """    const transferRecords = list(...transfers.map((transfer) => record({
      ledger: literal(transfer.definition.ledger),
      from: transfer.from,
      to: transfer.to,
      amount: transfer.amount,
    })));""",
    "ledger-tagged transfer records",
)
text = replace_once(
    text,
    """      const relevantTransfers = filter(
        transferRecords,
        'transfer',
        { kind: 'boolean', value: true },
      );""",
    """      const relevantTransfers = filter(
        transferRecords,
        'transfer',
        compare('eq', path(variable('transfer'), 'ledger'), literal(ledgerBinding)),
      );""",
    "per-ledger transfer filtering",
)
tx.write_text(text)

test = Path("packages/preset-riichi/test/ix3FirstTenLocalYaku.test.ts")
text = test.read_text()
text = replace_once(
    text,
    """  world.relations = [{
    id: 'relation:shape',""",
    """  world.zones = [
    {
      id: 'hand:south',
      kind: 'hand',
      ordered: true,
      entries: tiles
        .filter((entry) => direct || entry.id !== source.id)
        .map((entry, ordinal) => ({
          slotId: `hand:south:slot:${ordinal}`,
          entityId: entry.id,
          ordinal,
          metadata: {},
          state: 'occupied' as const,
        })),
      metadata: {},
    },
    ...(direct ? [] : [{
      id: 'river:east',
      kind: 'river',
      ordered: true,
      entries: [{
        slotId: 'river:east:slot:0',
        entityId: source.id,
        ordinal: 0,
        metadata: {},
        state: 'occupied' as const,
      }],
      metadata: {},
    }]),
  ];
  world.relations = [{
    id: 'relation:shape',""",
    "physical source zones in test fixture",
)
test.write_text(text)

print("semantic query refactor applied")
