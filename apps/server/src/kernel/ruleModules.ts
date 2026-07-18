import type { ActionAttempt, PublicPenaltyEffect, PublicViolation } from '@mahjongplus/shared';

export interface RuleAdjudicationContext {
  actorId: string;
  revision: number;
  attempt: ActionAttempt;
}

export interface RuleAdjudicationDelta {
  waiveViolationCodes?: string[];
  addViolations?: PublicViolation[];
  addPenalties?: PublicPenaltyEffect[];
  forceExecute?: boolean;
  forceReject?: boolean;
}

export interface ActionRuleModule {
  readonly id: string;
  readonly version: string;
  readonly priority: number;
  adjudicate(context: RuleAdjudicationContext): RuleAdjudicationDelta | null;
}

export class RuleModuleRegistry {
  private readonly modules: ActionRuleModule[];

  constructor(modules: ActionRuleModule[] = []) {
    this.modules = [...modules].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  }

  adjudicate(context: RuleAdjudicationContext): RuleAdjudicationDelta[] {
    return this.modules.map((module) => module.adjudicate(context)).filter((value): value is RuleAdjudicationDelta => Boolean(value));
  }
}
