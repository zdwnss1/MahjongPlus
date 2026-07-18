import type { PublicPenaltyEffect } from '@mahjongplus/shared';

export function applyScoreEffects(model: any, playerIds: string[], effects: PublicPenaltyEffect[]): void {
  for (const effect of effects) {
    if (effect.type !== 'score-delta' || effect.amount == null) continue;
    const engineId = playerIds.indexOf(effect.playerId);
    if (engineId >= 0) model.defen[engineId] += effect.amount;
  }
}
