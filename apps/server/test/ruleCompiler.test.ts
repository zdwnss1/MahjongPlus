import { describe, expect, it } from 'vitest';
import { RecordingRuleCompiler } from '../src/ruleCompiler.js';

const context = {
  constitution: { baseProfile: 'tenhou' as const, matchLength: 'east' as const, initialScore: 25000, bankruptcy: true, ruleSlotsPerPlayer: 1, actionTimeoutSeconds: 30, penaltyPolicy: { illegalActionPolicy: 'fixed-penalty' as const, mistimedActionPenalty: 1000, falseWinPenalty: 8000, distribution: 'split-opponents' as const, repeatedViolationLimit: 3 } },
  acceptedRules: [], authorId: 'p1', slot: 1,
};

describe('RecordingRuleCompiler', () => {
  it('rejects constitution mutations', async () => { expect((await new RecordingRuleCompiler().compile('把东风局改成半庄', context)).ok).toBe(false); });
  it('records ordinary rules as explicit non-executable artifacts', async () => {
    const result = await new RecordingRuleCompiler().compile('白板在顺子中可以视为五万', context);
    expect(result.ok).toBe(true); if (result.ok) expect(result.artifact.executable).toBe(false);
  });
});
