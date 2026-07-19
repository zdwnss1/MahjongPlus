import { describe, expect, it } from 'vitest';
import {
  MahjongLanguageAuthoringSession,
  validateRuleModuleDefinition,
  type PartitionInterpretationItem,
} from '@mahjongplus/world-language';
import {
  RIICHI_HAND_STRUCTURE_PROFILES,
  RIICHI_RESPONSE_INTERPRETATION_REGISTRY,
} from '../src/handStructureProfiles.js';

function item(id: string, face: string): PartitionInterpretationItem {
  return {
    id,
    attributes: {
      id,
      kind: 'tile',
      components: {
        tile: {
          baseFace: face,
          suit: face[0],
          rank: Number(face[1]),
          effectiveFaces: [face],
          traits: [],
        },
      },
    },
  };
}

describe('interpretation authoring tools', () => {
  it('compiles registry data and enumerates bounded non-authoritative proposals', () => {
    const session = new MahjongLanguageAuthoringSession();
    const module = session.callTool('mahjong.interpretation.compile-registry', {
      registry: RIICHI_RESPONSE_INTERPRETATION_REGISTRY,
    }) as ReturnType<typeof import('@mahjongplus/world-language').compileResponsePartitionInterpretationModule>;
    expect(validateRuleModuleDefinition(module)).toEqual([]);
    expect(module.id).toBe('service.riichi-response-hand-interpretation');

    const profile = RIICHI_HAND_STRUCTURE_PROFILES.find((entry) => entry.id === 'structure.seven-pairs');
    if (!profile) throw new Error('Missing seven-pairs profile.');
    const faces = ['m1', 'm1', 'm2', 'm2', 'p1', 'p1', 'p2', 'p2', 's1', 's1', 'z1', 'z1', 'z2', 'z2'];
    const proposals = session.callTool('mahjong.interpretation.enumerate', {
      profile,
      items: faces.map((face, index) => item(`tile:${index}`, face)),
      source: {
        mode: 'response',
        windowId: 'window:authoring',
        exposureId: 'event:authoring',
        sourceEntityId: 'tile:13',
        sourceActorId: 'east',
      },
    }) as Array<{ proposal: { structureId: string }; source: unknown }>;
    expect(proposals.some((entry) => entry.proposal.structureId === 'seven-pairs')).toBe(true);
  });
});
