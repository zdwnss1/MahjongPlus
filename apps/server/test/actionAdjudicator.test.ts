import { describe, expect, it } from 'vitest';
import type { ActionAttempt, PenaltyPolicy, TileInstanceView } from '@mahjongplus/shared';
import { ActionAdjudicator, type AdjudicationContext } from '../src/kernel/adjudicator.js';
import { PenaltyEngine } from '../src/kernel/penalties.js';
import { RuleModuleRegistry } from '../src/kernel/ruleModules.js';

const policy: PenaltyPolicy = { illegalActionPolicy: 'fixed-penalty', mistimedActionPenalty: 1000, falseWinPenalty: 8000, distribution: 'split-opponents', repeatedViolationLimit: 3 };
const hand: TileInstanceView[] = [{ id: 'tile-1', face: 'm1', physicalFace: 'm1', traits: [] }];
function context(attempt: ActionAttempt): AdjudicationContext {
  return { actorId: 'p1', playerIds: ['p1', 'p2', 'p3', 'p4'], revision: 5, attempt, opportunities: [], hand, violationCount: 0, penaltyEngine: new PenaltyEngine(policy), ruleModules: new RuleModuleRegistry() };
}

describe('ActionAdjudicator', () => {
  it('does not punish stale network attempts', () => {
    const result = new ActionAdjudicator().adjudicate(context({ attemptId: 'a1', observedRevision: 4, action: { type: 'win', mode: 'tsumo' } }));
    expect(result.outcome).toBe('stale'); expect(result.penalties).toHaveLength(0);
  });
  it('punishes false win declarations and distributes the penalty', () => {
    const result = new ActionAdjudicator().adjudicate(context({ attemptId: 'a2', observedRevision: 5, action: { type: 'win', mode: 'tsumo' } }));
    expect(result.outcome).toBe('rejected-with-penalty'); expect(result.violations[0].code).toBe('win.false-declaration');
    expect(result.penalties.reduce((sum, effect) => sum + (effect.amount ?? 0), 0)).toBe(0); expect(result.penalties.find((effect) => effect.playerId === 'p1')?.amount).toBe(-8000);
  });
  it('executes an offered physical-tile discard', () => {
    const value = context({ attemptId: 'a3', observedRevision: 5, action: { type: 'discard', tileId: 'tile-1' } });
    value.opportunities = [{ id: 'discard:m1', label: '打 m1', kind: 'discard', intent: { type: 'discard', tileId: 'tile-1' }, reply: { dapai: 'm1' } }];
    const result = new ActionAdjudicator().adjudicate(value); expect(result.outcome).toBe('executed'); expect(result.executeOption?.id).toBe('discard:m1');
  });
  it('lets rule modules waive a base violation and force an action path', () => {
    const value = context({ attemptId: 'a4', observedRevision: 5, action: { type: 'draw', source: 'wall' } });
    value.ruleModules = new RuleModuleRegistry([{ id: 'out-of-turn-draw', version: '1', priority: 1, adjudicate: () => ({ waiveViolationCodes: ['action.out-of-turn'], forceExecute: true }) }]);
    const result = new ActionAdjudicator().adjudicate(value); expect(result.outcome).toBe('executed'); expect(result.violations).toHaveLength(0);
  });
});
