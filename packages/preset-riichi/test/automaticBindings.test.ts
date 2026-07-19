import { describe, expect, it } from 'vitest';
import {
  MahjongLanguageAuthoringSession,
  compileWorld,
  composeWorldModulesWithAutoBindings,
  resolveRuleModuleBindings,
  type RuleModuleDefinition,
} from '@mahjongplus/world-language';
import {
  RIICHI_RULE_MODULES,
  createRiichiPhysicalWorldSource,
} from '../src/index.js';
import { buildPhysicalFixture } from './physicalFixture.js';
import { buildTurnWorldFixture, type PhysicalTileSpec } from './support/turnWorldFixture.js';

function moduleById(id: string): RuleModuleDefinition {
  const module = RIICHI_RULE_MODULES.find((entry) => entry.id === id);
  if (!module) throw new Error(`Missing catalog module ${id}.`);
  return module;
}

function filler(seat: string, count: number): PhysicalTileSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tile:${seat}:filler:${index}`,
    face: `${['m', 'p', 's'][index % 3]}${(index % 9) + 1}`,
  }));
}

describe('declarative automatic module bindings', () => {
  it('resolves and composes the common flow from physical-world structure', () => {
    const physical = createRiichiPhysicalWorldSource({ seed: 'auto-common-flow', dealer: 'west' });
    const common = moduleById('riichi.common-flow');
    const resolution = resolveRuleModuleBindings(physical, common);

    expect(resolution.diagnostics).toEqual([]);
    expect(resolution.bindings).toEqual({
      playerIds: ['east', 'south', 'west', 'north'],
      dealerId: 'west',
      liveZoneId: 'wall.live',
    });

    const composed = composeWorldModulesWithAutoBindings(physical, [{ definition: common }]);
    expect(composed.diagnostics).toEqual([]);
    expect(composed.resolvedApplications[0].bindings).toEqual(resolution.bindings);
    expect(composed.world.actions.map((entry) => entry.id)).toContain('discard');
    expect(composed.world.procedures.map((entry) => entry.id)).toEqual(['hand.setup', 'turn']);
    expect(() => compileWorld(composed.world)).not.toThrow();
  });

  it('derives Super indicator candidates from the unique dead wall', () => {
    const base = buildPhysicalFixture({ deadWallTileCount: 14 });
    const enhanced = moduleById('rule.super-riichi');
    const resolution = resolveRuleModuleBindings(base.source, enhanced);

    expect(resolution.diagnostics).toEqual([]);
    expect(resolution.bindings).toMatchObject({
      ledgerId: 'ledger:points',
      liveZoneId: 'wall.live',
      deadZoneId: 'wall.dead',
    });
    expect(resolution.bindings.indicatorCandidates).toEqual(
      base.ids.deadTileIds.filter((_id, index) => index % 2 === 0)
        .map((tileId, ordinal) => ({ tileId, ordinal })),
    );

    const composed = composeWorldModulesWithAutoBindings(base.source, [{ definition: enhanced }]);
    expect(composed.diagnostics).toEqual([]);
    expect(composed.world.actions.map((entry) => entry.id)).toContain('declare-riichi');
    expect(() => compileWorld(composed.world)).not.toThrow();
  });

  it('resolves declaration and continuing-flow dependencies from an evolving world', () => {
    const seats = ['east', 'south', 'west', 'north'];
    const triplet = Array.from({ length: 3 }, (_, index) => ({
      id: `tile:east:m7:${index}`,
      face: 'm7',
    }));
    const initialDraw = { id: 'tile:east:initial', face: 'p5' };
    const wall = Array.from({ length: 3 }, (_, index) => ({ id: `tile:wall:${index}`, face: `s${index + 1}` }));
    const base = buildTurnWorldFixture({
      seats,
      initialOwnerId: 'east',
      hands: {
        east: [...triplet, ...filler('east', 10), initialDraw],
        south: filler('south', 13),
        west: filler('west', 13),
        north: filler('north', 13),
      },
      wall,
      canWinOn: [{ playerId: 'south', tileId: initialDraw.id }],
    });
    const declaration = moduleById('rule.turbo-riichi.declaration');
    const continuing = moduleById('flow.continuing-multi-win');
    const composed = composeWorldModulesWithAutoBindings(base.source, [
      { definition: declaration },
      { definition: continuing },
    ]);

    expect(composed.diagnostics).toEqual([]);
    expect(composed.resolvedApplications[0].bindings).toEqual({
      ledgerId: 'ledger:points',
      playerIds: seats,
      turnProcedureId: 'turn',
      awaitDiscardNodeId: 'await-discard',
    });
    expect(composed.resolvedApplications[1].bindings).toMatchObject({
      playerIds: seats,
      turnPairs: [
        { actorId: 'east', nextActorId: 'south' },
        { actorId: 'south', nextActorId: 'west' },
        { actorId: 'west', nextActorId: 'north' },
        { actorId: 'north', nextActorId: 'east' },
      ],
      liveZoneId: 'wall.live',
      canWinRelationType: 'can-win-on',
      turnProcedureId: 'turn',
      awaitDrawNodeId: 'await-draw',
      awaitDiscardNodeId: 'await-discard',
      drawActionId: 'draw',
      discardActionId: 'discard',
      endActionId: 'end-exhaustive-draw',
      discardPolicyTrackId: 'track:discard-policies',
    });
    expect(composed.resolvedApplications[1].bindings?.initialDraws).toEqual(
      seats.map((subjectId) => ({ subjectId, tileId: null, exposureId: null })),
    );
    expect(() => compileWorld(composed.world)).not.toThrow();
  });

  it('reports a real missing action instead of guessing an alternative binding', () => {
    const physical = createRiichiPhysicalWorldSource({ seed: 'auto-gap' });
    const common = moduleById('riichi.common-flow');
    const declaration = moduleById('rule.turbo-riichi.declaration');
    const continuing = moduleById('flow.continuing-multi-win');
    const composed = composeWorldModulesWithAutoBindings(physical, [
      { definition: common },
      { definition: declaration },
      { definition: continuing },
    ]);

    expect(composed.resolvedApplications.map((entry) => entry.definition.id)).toEqual([
      'riichi.common-flow',
    ]);
    expect(composed.diagnostics).toContainEqual(expect.objectContaining({
      moduleId: 'rule.turbo-riichi.declaration',
      binding: 'ledgerId',
      code: 'no-match',
    }));

    const turnBase = buildTurnWorldFixture({
      seats: ['east', 'south', 'west', 'north'],
      initialOwnerId: 'east',
      hands: {
        east: filler('east', 14), south: filler('south', 13),
        west: filler('west', 13), north: filler('north', 13),
      },
      wall: [{ id: 'tile:wall:0', face: 'm1' }],
    });
    turnBase.source.actions = turnBase.source.actions.filter((entry) => entry.id !== 'end-exhaustive-draw');
    const flowResolution = resolveRuleModuleBindings(
      composeWorldModulesWithAutoBindings(turnBase.source, [{ definition: declaration }]).world,
      continuing,
    );
    expect(flowResolution.diagnostics).toContainEqual(expect.objectContaining({
      binding: 'endActionId',
      code: 'no-match',
    }));
    expect(flowResolution.resolved).toBe(false);
  });

  it('rejects ambiguous structural matches unless an explicit binding overrides them', () => {
    const base = buildPhysicalFixture();
    base.source.entities.push({
      id: 'ledger:bonus',
      kind: 'resource-ledger',
      components: { ledger: { asset: 'points', accounts: [] } },
    });
    const enhanced = moduleById('rule.super-riichi');
    const ambiguous = resolveRuleModuleBindings(base.source, enhanced);
    expect(ambiguous.diagnostics).toContainEqual(expect.objectContaining({
      binding: 'ledgerId',
      code: 'ambiguous-match',
    }));
    expect(ambiguous.resolved).toBe(false);

    const explicit = resolveRuleModuleBindings(base.source, enhanced, { ledgerId: 'ledger:points' });
    expect(explicit.diagnostics).toEqual([]);
    expect(explicit.bindings.ledgerId).toBe('ledger:points');
  });

  it('exposes binding resolution and automatic composition through the LLM session', () => {
    const physical = createRiichiPhysicalWorldSource({ seed: 'auto-session' });
    const common = moduleById('riichi.common-flow');
    const session = new MahjongLanguageAuthoringSession({ modules: RIICHI_RULE_MODULES });

    const resolution = session.callTool('mahjong.module.resolve-bindings', {
      world: physical,
      module: common,
    }) as ReturnType<typeof resolveRuleModuleBindings>;
    expect(resolution.resolved).toBe(true);
    expect(resolution.bindings.dealerId).toBe('east');

    const composed = session.callTool('mahjong.world.compose-auto', {
      world: physical,
      applications: [{ definition: common }],
    }) as ReturnType<typeof composeWorldModulesWithAutoBindings>;
    expect(composed.diagnostics).toEqual([]);
    expect(composed.resolvedApplications[0].bindings).toEqual(resolution.bindings);
  });
});
