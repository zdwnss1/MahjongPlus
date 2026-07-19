import { describe, expect, it } from 'vitest';
import {
  MahjongLanguageAuthoringSession,
  analyzeRuleModuleDefinition,
  analyzeWorldSource,
  compileWorld,
  diagnoseModuleComposition,
  diagnoseWorldSemantics,
} from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import {
  RIICHI_COMMON_FLOW_MODULE,
  RIICHI_RULE_MODULES,
  RIICHI_RULE_MODULE_ANALYSES,
  createRiichiPhysicalWorldSource,
  createRiichiWorldSource,
} from '../src/index.js';

function attempt(
  runtime: WorldRuntime,
  attemptId: string,
  actorId: string,
  actionId: string,
  parameters: Record<string, unknown> = {},
) {
  return runtime.attempt({
    attemptId,
    actorId,
    actionId,
    observedRevision: runtime.currentRevision,
    parameters,
  });
}

describe('existing riichi semantic inventory', () => {
  it('separates deterministic physical generation from declarative common flow', () => {
    const physical = createRiichiPhysicalWorldSource({ seed: 'semantic-inventory' });
    expect(physical.actions).toEqual([]);
    expect(physical.procedures).toEqual([]);
    expect(physical.responseWindows).toEqual([]);
    expect(analyzeWorldSource(physical).hostBoundary).toMatchObject({ semanticRules: false });

    const diagnosis = diagnoseModuleComposition(physical, [{
      definition: RIICHI_COMMON_FLOW_MODULE,
      bindings: {
        playerIds: ['east', 'south', 'west', 'north'],
        dealerId: 'east',
        liveZoneId: 'wall.live',
      },
    }]);
    expect(diagnosis.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(diagnosis.world).toBeDefined();

    const world = createRiichiWorldSource({ seed: 'semantic-inventory' });
    const analysis = analyzeWorldSource(world);
    expect(analysis.actions.map((entry) => entry.id)).toEqual([
      'draw', 'discard', 'response.pass', 'ron', 'pon', 'open-kan', 'chi',
    ]);
    expect(analysis.procedures.map((entry) => entry.id)).toEqual(['hand.setup', 'turn']);
    expect(analysis.responseWindows.map((entry) => entry.id)).toEqual(['riichi.discard-response']);
    expect(analysis.eventProducers['meld.committed']).toEqual([
      'window:riichi.discard-response/chi',
      'window:riichi.discard-response/open-kan',
      'window:riichi.discard-response/pon',
    ]);
    expect(diagnoseWorldSemantics(world).filter((entry) => entry.severity === 'error')).toEqual([]);
  });

  it('executes deal, draw, discard and response from the common-flow module', () => {
    const world = createRiichiWorldSource({ seed: 'common-flow-runtime' });
    const runtime = new WorldRuntime(compileWorld(world));
    runtime.start();

    for (const seat of ['east', 'south', 'west', 'north']) {
      expect(runtime.store.zoneEntityIds(`hand:${seat}`)).toHaveLength(13);
    }
    expect(runtime.scheduler.find('turn', 'await-draw', 'east')).toBeDefined();

    expect(attempt(runtime, 'east-draw', 'east', 'draw').outcome).toBe('executed');
    expect(runtime.store.zoneEntityIds('hand:east')).toHaveLength(14);
    const tileId = runtime.store.zoneEntityIds('hand:east')[0];
    expect(attempt(runtime, 'east-discard', 'east', 'discard', { tileId }).outcome).toBe('executed');
    expect(runtime.store.zoneEntityIds('river:east')).toContain(tileId);
    const window = runtime.openResponseWindows()[0];
    expect(window.definitionId).toBe('riichi.discard-response');

    for (const seat of ['south', 'west', 'north']) {
      expect(attempt(runtime, `${seat}-pass`, seat, 'response.pass', { windowId: window.id }).outcome).toBe('executed');
    }
    expect(runtime.openResponseWindows()).toEqual([]);
    expect(runtime.scheduler.find('turn', 'await-draw', 'south')).toBeDefined();
  });

  it('parses every current module into one stable semantic shape', () => {
    expect(RIICHI_RULE_MODULE_ANALYSES).toHaveLength(RIICHI_RULE_MODULES.length);
    const ids = RIICHI_RULE_MODULE_ANALYSES.map((entry) => entry.id);
    expect(ids).toContain('riichi.common-flow');
    expect(ids).toContain('rule.super-riichi');
    expect(ids).toContain('rule.turbo-riichi.declaration');
    expect(ids).toContain('rule.continuing-win-flow');

    const common = RIICHI_RULE_MODULE_ANALYSES.find((entry) => entry.id === 'riichi.common-flow');
    expect(common?.provides.actions).toEqual([
      'chi', 'discard', 'draw', 'open-kan', 'pon', 'response.pass', 'ron',
    ]);
    expect(common?.provides.events).toEqual([
      'meld.committed', 'tile.discarded', 'tile.drawn', 'win.claimed',
    ]);
    expect(common?.requiredBindings).toEqual(['dealerId', 'liveZoneId', 'playerIds']);

    for (const module of RIICHI_RULE_MODULES) {
      const roundTrip = JSON.parse(JSON.stringify(module));
      expect(analyzeRuleModuleDefinition(roundTrip).id).toBe(module.id);
    }
  });

  it('exposes analysis and composition diagnosis to the LLM authoring session', () => {
    const physical = createRiichiPhysicalWorldSource({ seed: 'authoring-analysis' });
    const session = new MahjongLanguageAuthoringSession({ modules: RIICHI_RULE_MODULES });
    const moduleAnalysis = session.callTool('mahjong.module.analyze', {
      module: RIICHI_COMMON_FLOW_MODULE,
    }) as ReturnType<typeof analyzeRuleModuleDefinition>;
    expect(moduleAnalysis.provides.responseWindows).toEqual(['riichi.discard-response']);

    const missing = session.callTool('mahjong.world.diagnose', {
      world: physical,
      applications: [{ definition: RIICHI_COMMON_FLOW_MODULE }],
    }) as ReturnType<typeof diagnoseModuleComposition>;
    expect(missing.diagnostics.filter((entry) => entry.code === 'missing-binding').map((entry) => entry.target)).toEqual([
      'playerIds', 'dealerId', 'liveZoneId',
    ]);

    const duplicate = session.callTool('mahjong.world.diagnose', {
      world: physical,
      applications: [
        {
          definition: RIICHI_COMMON_FLOW_MODULE,
          bindings: { playerIds: ['east', 'south', 'west', 'north'], dealerId: 'east', liveZoneId: 'wall.live' },
        },
        {
          definition: RIICHI_COMMON_FLOW_MODULE,
          bindings: { playerIds: ['east', 'south', 'west', 'north'], dealerId: 'east', liveZoneId: 'wall.live' },
        },
      ],
    }) as ReturnType<typeof diagnoseModuleComposition>;
    expect(duplicate.diagnostics.some((entry) => entry.code === 'duplicate-action' || entry.code === 'world-compilation-failed'))
      .toBe(true);
  });
});
