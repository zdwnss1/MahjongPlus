import { describe, expect, it } from 'vitest';
import {
  MAHJONG_LANGUAGE_MCP_CATALOG,
  MAHJONG_LANGUAGE_SYSTEM_PROMPT,
  MahjongLanguageAuthoringSession,
} from '@mahjongplus/world-language';
import {
  RIICHI_RULE_MODULE_ANALYSES,
  RIICHI_RULE_MODULES,
  RIICHI_SEMANTIC_CATALOG,
  type RiichiSemanticCatalog,
} from '../src/index.js';

function uniqueIds(values: Array<{ id: string }>): boolean {
  return new Set(values.map((entry) => entry.id)).size === values.length;
}

describe('machine-readable riichi semantic catalog', () => {
  it('classifies every current module without treating fixture support as production integration', () => {
    expect(RIICHI_SEMANTIC_CATALOG.modules.map((entry) => entry.id).sort())
      .toEqual(RIICHI_RULE_MODULE_ANALYSES.map((entry) => entry.id).sort());
    expect(RIICHI_SEMANTIC_CATALOG.modules).toHaveLength(RIICHI_RULE_MODULES.length);

    expect(RIICHI_SEMANTIC_CATALOG.modules.find((entry) => entry.id === 'riichi.common-flow')?.status)
      .toBe('implemented');
    expect(RIICHI_SEMANTIC_CATALOG.modules.find((entry) => entry.id === 'local.thirteen-misfits')?.status)
      .toBe('fixture-only');
    expect(RIICHI_SEMANTIC_CATALOG.modules.find((entry) => entry.id === 'rule.super-riichi')?.status)
      .toBe('fixture-only');
    expect(RIICHI_SEMANTIC_CATALOG.modules.find((entry) => entry.id === 'flow.continuing-multi-win')?.status)
      .toBe('fixture-only');
  });

  it('keeps backend, service, profile and gap references internally consistent', () => {
    expect(uniqueIds(RIICHI_SEMANTIC_CATALOG.backends)).toBe(true);
    expect(uniqueIds(RIICHI_SEMANTIC_CATALOG.modules)).toBe(true);
    expect(uniqueIds(RIICHI_SEMANTIC_CATALOG.services)).toBe(true);
    expect(uniqueIds(RIICHI_SEMANTIC_CATALOG.profiles)).toBe(true);
    expect(uniqueIds(RIICHI_SEMANTIC_CATALOG.gaps)).toBe(true);

    const backends = new Set(RIICHI_SEMANTIC_CATALOG.backends.map((entry) => entry.id));
    const modules = new Set(RIICHI_SEMANTIC_CATALOG.modules.map((entry) => entry.id));
    const services = new Set(RIICHI_SEMANTIC_CATALOG.services.map((entry) => entry.id));
    const gaps = new Set(RIICHI_SEMANTIC_CATALOG.gaps.map((entry) => entry.id));

    for (const profile of RIICHI_SEMANTIC_CATALOG.profiles) {
      expect(profile.backends.filter((id) => !backends.has(id))).toEqual([]);
      expect(profile.modules.filter((id) => !modules.has(id))).toEqual([]);
      expect(profile.services.filter((id) => !services.has(id))).toEqual([]);
      expect(profile.unresolvedGaps.filter((id) => !gaps.has(id))).toEqual([]);
    }
  });

  it('records the actual standard-profile boundary instead of implying a complete riichi game', () => {
    const common = RIICHI_SEMANTIC_CATALOG.profiles.find((entry) => entry.id === 'profile.riichi-common-current');
    expect(common?.status).toBe('partial');
    expect(common?.modules).toEqual(['riichi.common-flow']);
    expect(common?.unresolvedGaps).toEqual(expect.arrayContaining([
      'gap.standard-riichi-declaration',
      'gap.hand-interpretation',
      'gap.yaku-evaluation-pipeline',
      'gap.fu-limit-payment-interpretation',
      'gap.standard-settlement-integration',
      'gap.draw-and-abortive-endings',
      'gap.match-lifecycle',
    ]));

    const settlement = RIICHI_SEMANTIC_CATALOG.services.find((entry) => entry.id === 'service.outcome-settlement');
    expect(settlement?.status).toBe('implemented');
    expect(settlement?.excludes).toEqual(expect.arrayContaining(['hand interpretation', 'yaku', 'fu']));
  });

  it('survives JSON round-trip as a pure data resource', () => {
    const roundTrip = JSON.parse(JSON.stringify(RIICHI_SEMANTIC_CATALOG)) as RiichiSemanticCatalog;
    expect(roundTrip).toEqual(RIICHI_SEMANTIC_CATALOG);
    expect(roundTrip.schemaVersion).toBe('mahjong-semantic-catalog/0.1');
  });

  it('is readable through the generic LLM authoring-session resource boundary', () => {
    const session = new MahjongLanguageAuthoringSession({
      modules: RIICHI_RULE_MODULES,
      resources: { 'mahjongplus://catalog/current': RIICHI_SEMANTIC_CATALOG },
    });
    expect(session.readResource('mahjongplus://catalog/current')).toEqual(RIICHI_SEMANTIC_CATALOG);
    expect(session.callTool('mahjong.catalog.inspect', {})).toEqual(RIICHI_SEMANTIC_CATALOG);

    const names = MAHJONG_LANGUAGE_MCP_CATALOG.tools.map((entry) => entry.name);
    expect(names).toContain('mahjong.catalog.inspect');
    expect(MAHJONG_LANGUAGE_MCP_CATALOG.resources.map((entry) => entry.uri))
      .toContain('mahjongplus://catalog/current');
    expect(MAHJONG_LANGUAGE_SYSTEM_PROMPT).toContain('mahjongplus://catalog/current');
    expect(MAHJONG_LANGUAGE_SYSTEM_PROMPT).toContain('fixture-only');
  });
});
