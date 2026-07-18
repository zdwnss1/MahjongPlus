import type { MatchConstitution } from '@mahjongplus/shared';
import { z } from 'zod';

export const penaltyPolicySchema = z.object({
  illegalActionPolicy: z.enum(['reject-only', 'fixed-penalty']),
  mistimedActionPenalty: z.number().int().min(0).max(1_000_000_000),
  falseWinPenalty: z.number().int().min(0).max(1_000_000_000),
  distribution: z.enum(['burn', 'split-opponents']),
  repeatedViolationLimit: z.number().int().min(1).max(100),
});

export const constitutionSchema = z.object({
  baseProfile: z.enum(['tenhou', 'mleague']),
  matchLength: z.enum(['east', 'hanchan']),
  initialScore: z.number().int().min(1000).max(1_000_000_000),
  bankruptcy: z.boolean(),
  ruleSlotsPerPlayer: z.number().int().min(0).max(5),
  actionTimeoutSeconds: z.number().int().min(10).max(180),
  penaltyPolicy: penaltyPolicySchema,
});

export const DEFAULT_CONSTITUTION = Object.freeze({
  baseProfile: 'tenhou',
  matchLength: 'east',
  initialScore: 25000,
  bankruptcy: true,
  ruleSlotsPerPlayer: 1,
  actionTimeoutSeconds: 45,
  penaltyPolicy: {
    illegalActionPolicy: 'fixed-penalty',
    mistimedActionPenalty: 1000,
    falseWinPenalty: 8000,
    distribution: 'split-opponents',
    repeatedViolationLimit: 3,
  },
} as const satisfies MatchConstitution);
