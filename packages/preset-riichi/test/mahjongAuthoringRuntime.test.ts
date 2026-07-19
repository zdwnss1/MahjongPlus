import { describe, expect, it } from 'vitest';
import type { CoreExpression, CoreFormula } from '@mahjongplus/world-calculus';
import {
  MahjongLanguageAuthoringSession,
  instantiateRuleModule,
} from '@mahjongplus/world-language';
import { createDefaultMahjongLanguageRuntimeAdapter } from '@mahjongplus/world-runtime';
import { RIICHI_RULE_MODULES } from '../src/ruleModuleCatalog.js';
import { buildPhysicalFixture } from './physicalFixture.js';

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });

function moduleById(id: string) {
  const module = RIICHI_RULE_MODULES.find((entry) => entry.id === id);
  if (!module) throw new Error(`Missing rule module ${id}.`);
  return module;
}

function superWorld(parameters: Record<string, unknown> = {}) {
  const base = buildPhysicalFixture();
  const result = instantiateRuleModule(base.source, {
    definition: moduleById('rule.super-riichi'),
    parameters,
    bindings: base.bindings,
  });
  return { base, ...result };
}

function session() {
  return new MahjongLanguageAuthoringSession({
    modules: RIICHI_RULE_MODULES,
    runtime: createDefaultMahjongLanguageRuntimeAdapter(),
  });
}

describe('callable Mahjong language runtime adapter', () => {
  it('simulates revisioned attempts and returns authoritative final state', () => {
    const { world } = superWorld({ scope: 'global', indicatorPolicy: 'standard-cap' });
    const result = session().callTool('mahjong.world.simulate', {
      world,
      attempts: [
        {
          attemptId: 'east-super',
          actorId: 'east',
          actionId: 'declare-riichi',
          parameters: { mode: 'super' },
        },
        {
          attemptId: 'east-super',
          actorId: 'east',
          actionId: 'declare-riichi',
          parameters: { mode: 'super' },
        },
        {
          attemptId: 'stale-south',
          actorId: 'south',
          actionId: 'declare-riichi',
          observedRevision: 0,
          parameters: { mode: 'standard' },
        },
      ],
    }) as {
      steps: Array<{ receipt: { outcome: string; revisionAfter: number } }>;
      final: { revision: number; world: { entities: Array<{ id: string; components: Record<string, unknown> }> } };
    };

    expect(result.steps.map((step) => step.receipt.outcome)).toEqual(['executed', 'executed', 'stale']);
    expect(result.steps[1].receipt).toEqual(result.steps[0].receipt);
    const ledger = result.final.world.entities.find((entity) => entity.id === 'ledger:points')?.components.ledger as {
      accounts: Array<{ id: string; balance: number }>;
    };
    expect(ledger.accounts.find((entry) => entry.id === 'east')?.balance).toBe(20_000);
    expect(ledger.accounts.find((entry) => entry.id === 'riichi-pot')?.balance).toBe(5_000);
    const reveal = result.final.world.entities.find((entity) => entity.id === 'track:dora-indicators')
      ?.components.revealTrack as { revealedCount: number };
    expect(reveal.revealedCount).toBe(2);
  });

  it('explains a rejected action with its frozen requirement definition', () => {
    const { world } = superWorld({ scope: 'owner-only', ownerId: 'east' });
    const explanation = session().callTool('mahjong.world.explain', {
      world,
      subject: {
        kind: 'attempt',
        attempts: [{
          attemptId: 'south-super',
          actorId: 'south',
          actionId: 'declare-riichi',
          parameters: { mode: 'super' },
        }],
        attemptId: 'south-super',
      },
    }) as {
      receipt: { outcome: string };
      failedRequirements: Array<{ id: string; definition?: { kind: string; programId?: string } }>;
    };
    expect(explanation.receipt.outcome).toBe('rejected');
    expect(explanation.failedRequirements).toContainEqual(expect.objectContaining({
      id: 'declare-riichi.core-eligibility',
      definition: expect.objectContaining({ kind: 'core.constraint', programId: 'super-riichi.action-eligible' }),
    }));
  });

  it('reports static dependencies and semantic/physical world differences', () => {
    const { base, world } = superWorld({ indicatorPolicy: 'unbounded-extend' });
    const tools = session();
    const dependencies = tools.callTool('mahjong.world.dependencies', { world }) as {
      actions: Array<{ id: string; constraintPrograms: string[]; rewrites: string[]; events: string[] }>;
      corePrograms: { rewrites: Array<{ id: string; writes: string[] }> };
    };
    const declaration = dependencies.actions.find((entry) => entry.id === 'declare-riichi');
    expect(declaration?.constraintPrograms).toContain('super-riichi.action-eligible');
    expect(declaration?.rewrites).toContain('super-riichi.commit');
    expect(declaration?.events).toContain('declaration.published');
    expect(dependencies.corePrograms.rewrites.find((entry) => entry.id === 'super-riichi.commit')?.writes)
      .toContain('world.zones.0.entries');

    const diff = tools.callTool('mahjong.world.diff', { before: base.source, after: world }) as {
      changed: boolean;
      entities: { added: string[] };
      actions: { added: string[] };
      corePrograms: { constraints: { added: string[] }; rewrites: { added: string[] } };
      physicalLayouts: { before: Record<string, unknown>; after: Record<string, unknown> };
    };
    expect(diff.changed).toBe(true);
    expect(diff.actions.added).toContain('declare-riichi');
    expect(diff.entities.added).toContain('track:dora-indicators');
    expect(diff.corePrograms.constraints.added).toContain('super-riichi.action-eligible');
    expect(diff.corePrograms.rewrites.added).toContain('super-riichi.commit');
    expect(diff.physicalLayouts.before).toEqual(diff.physicalLayouts.after);
  });

  it('finds a bounded counterexample using a closed-calculus invariant', () => {
    const { world } = superWorld({ scope: 'global', indicatorPolicy: 'standard-cap' });
    const ledgerIndex = world.entities.findIndex((entity) => entity.id === 'ledger:points');
    const accounts = path(variable('world'), 'entities', String(ledgerIndex), 'components', 'ledger', 'accounts');
    const pot = path(filter(
      accounts,
      'account',
      compare('eq', path(variable('account'), 'id'), literal('riichi-pot')),
    ), '0');
    const invariant = compare('lte', path(pot, 'balance'), literal(4_000));
    const result = session().callTool('mahjong.world.find-counterexample', {
      world,
      invariant,
      bounds: {
        maxDepth: 1,
        maxTraces: 20,
        actors: ['east'],
        actions: [{ actionId: 'declare-riichi', parameterCases: [{ mode: 'standard' }, { mode: 'super' }] }],
      },
    }) as {
      found: boolean;
      trace: Array<{ actionId: string; parameters: Record<string, unknown> }>;
      result: { steps: Array<{ receipt: { outcome: string } }> };
    };
    expect(result.found).toBe(true);
    expect(result.trace).toEqual([{ actorId: 'east', actionId: 'declare-riichi', parameters: { mode: 'super' } }]);
    expect(result.result.steps[0].receipt.outcome).toBe('executed');
  });
});
