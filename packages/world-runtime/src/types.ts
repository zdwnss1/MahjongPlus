import type { WorldRef } from '@mahjongplus/world-model';

export interface ProcedureToken {
  id: string;
  procedureId: string;
  nodeId: string;
  ownerId: string;
  localState: Record<string, unknown>;
}

export interface RuntimeEvent {
  id: string;
  type: string;
  revision: number;
  actorId?: string;
  subjects: WorldRef[];
  objects: WorldRef[];
  causedByActionId?: string;
  payload: Record<string, unknown>;
}

export interface WorldActionAttempt {
  attemptId: string;
  actorId: string;
  actionId: string;
  observedRevision: number;
  parameters: Record<string, unknown>;
}

export interface RequirementFailure {
  id: string;
  message: string;
}

export type WorldActionOutcome = 'executed' | 'rejected' | 'stale' | 'invalid';

export interface WorldActionReceipt {
  attemptId: string;
  outcome: WorldActionOutcome;
  revisionBefore: number;
  revisionAfter: number;
  failures: RequirementFailure[];
  eventIds: string[];
}
