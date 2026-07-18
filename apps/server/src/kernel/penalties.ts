import type { PenaltyPolicy, PublicPenaltyEffect, ViolationCode } from '@mahjongplus/shared';

export interface PenaltyContext {
  actorId: string;
  opponentIds: string[];
  violationCode: ViolationCode;
  violationCount: number;
}

export class PenaltyEngine {
  constructor(private readonly policy: PenaltyPolicy) {}

  propose(context: PenaltyContext): PublicPenaltyEffect[] {
    if (this.policy.illegalActionPolicy === 'reject-only') return [];
    const total = context.violationCode === 'win.false-declaration'
      ? this.policy.falseWinPenalty
      : this.policy.mistimedActionPenalty;
    if (total <= 0) return [];

    const effects: PublicPenaltyEffect[] = [{
      type: 'score-delta',
      playerId: context.actorId,
      amount: -total,
      message: context.violationCode === 'win.false-declaration'
        ? `错误和牌宣言，扣除 ${total} 点。`
        : `不合时机的动作，扣除 ${total} 点。`,
    }];

    if (this.policy.distribution === 'split-opponents' && context.opponentIds.length > 0) {
      const base = Math.floor(total / context.opponentIds.length);
      let remainder = total - base * context.opponentIds.length;
      for (const opponentId of context.opponentIds) {
        const amount = base + (remainder > 0 ? 1 : 0);
        remainder = Math.max(0, remainder - 1);
        effects.push({ type: 'score-delta', playerId: opponentId, amount, message: `获得犯规罚点 ${amount}。` });
      }
    }

    if (context.violationCount + 1 >= this.policy.repeatedViolationLimit) {
      effects.push({ type: 'warning', playerId: context.actorId, message: '已达到宪法设定的重复犯规警戒线。' });
    }
    return effects;
  }
}
