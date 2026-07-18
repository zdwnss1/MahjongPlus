import type { ActionIntent, ActionKind } from '@mahjongplus/shared';

export interface InternalActionOption {
  id: string;
  label: string;
  kind: ActionKind;
  intent: ActionIntent;
  reply: Record<string, string>;
}

export interface InternalActionRequest {
  id: string;
  prompt: string;
  expiresAt: number;
  options: InternalActionOption[];
}
