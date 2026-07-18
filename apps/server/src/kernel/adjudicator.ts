import type {
  ActionAttempt,
  ActionIntent,
  ActionOutcome,
  PublicPenaltyEffect,
  PublicViolation,
  TileInstanceView,
  ViolationCode,
} from '@mahjongplus/shared';
import type { InternalActionOption } from '../gameTypes.js';
import { PenaltyEngine } from './penalties.js';
import { RuleModuleRegistry } from './ruleModules.js';

export interface AdjudicationContext {
  actorId: string;
  playerIds: string[];
  revision: number;
  attempt: ActionAttempt;
  opportunities: InternalActionOption[];
  hand: TileInstanceView[];
  violationCount: number;
  penaltyEngine: PenaltyEngine;
  ruleModules: RuleModuleRegistry;
}

export interface AdjudicationResult {
  outcome: ActionOutcome;
  violations: PublicViolation[];
  penalties: PublicPenaltyEffect[];
  executeOption?: InternalActionOption;
  executeBuiltin?: 'reveal-hand' | 'pass';
}

function violation(code: ViolationCode, message: string, blocking = true): PublicViolation {
  return { code, message, blocking };
}

function intentKind(intent: ActionIntent): string {
  if (intent.type === 'win') return intent.mode;
  if (intent.type === 'call') return intent.kind;
  if (intent.type === 'kan') return intent.kind;
  return intent.type;
}

function equivalent(left: ActionIntent, right: ActionIntent, hand: TileInstanceView[]): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'discard' && right.type === 'discard') {
    const attempted = hand.find((tile) => tile.id === left.tileId);
    const offered = hand.find((tile) => tile.id === right.tileId);
    return Boolean(attempted && offered && attempted.face === offered.face);
  }
  if (left.type === 'riichi' && right.type === 'riichi') {
    const attempted = hand.find((tile) => tile.id === left.tileId);
    const offered = hand.find((tile) => tile.id === right.tileId);
    return Boolean(attempted && offered && attempted.face === offered.face);
  }
  if (left.type === 'win' && right.type === 'win') return left.mode === right.mode;
  if (left.type === 'call' && right.type === 'call') {
    return left.kind === right.kind && (!left.meld || left.meld === right.meld);
  }
  if (left.type === 'kan' && right.type === 'kan') {
    return left.kind === right.kind && (!left.meld || left.meld === right.meld);
  }
  if (left.type === 'abortive-draw' && right.type === 'abortive-draw') return true;
  if (left.type === 'pass' && right.type === 'pass') return true;
  if (left.type === 'draw' && right.type === 'draw') return left.source === right.source;
  if (left.type === 'reveal-hand' && right.type === 'reveal-hand') return true;
  if (left.type === 'custom' && right.type === 'custom') return left.actionType === right.actionType;
  return false;
}

export class ActionAdjudicator {
  adjudicate(context: AdjudicationContext): AdjudicationResult {
    const { attempt } = context;
    if (attempt.observedRevision !== context.revision) {
      return {
        outcome: 'stale',
        violations: [violation('action.stale', '牌局状态已变化；此次尝试不处罚，请同步后重试。')],
        penalties: [],
      };
    }

    if (attempt.action.type === 'reveal-hand') {
      return { outcome: 'executed', violations: [], penalties: [], executeBuiltin: 'reveal-hand' };
    }
    if (attempt.action.type === 'pass' && !context.opportunities.some((option) => option.intent.type === 'pass')) {
      return { outcome: 'executed', violations: [], penalties: [], executeBuiltin: 'pass' };
    }

    const attemptedAction = attempt.action;
    if ((attemptedAction.type === 'discard' || attemptedAction.type === 'riichi')
      && !context.hand.some((tile) => tile.id === attemptedAction.tileId)) {
      return {
        outcome: 'invalid',
        violations: [violation('action.invalid-reference', '指定的物理牌实例不在你的手牌中。')],
        penalties: [],
      };
    }

    const matching = context.opportunities.find((option) => equivalent(attempt.action, option.intent, context.hand));
    if (matching) {
      return { outcome: 'executed', violations: [], penalties: [], executeOption: matching };
    }

    const violations: PublicViolation[] = [];
    if (attempt.action.type === 'win') {
      violations.push(violation('win.false-declaration', `当前不能${attempt.action.mode === 'tsumo' ? '自摸' : '荣和'}。`));
    } else if ((attempt.action.type === 'call' || attempt.action.type === 'kan') && !attempt.action.meld) {
      violations.push(violation('action.missing-parameters', '该动作需要指定副露组合。'));
    } else if (attempt.action.type === 'custom') {
      violations.push(violation('action.unsupported-by-base-engine', `当前规则包没有注册动作 ${attempt.action.actionType}。`));
    } else {
      violations.push(violation(
        attempt.action.type === 'draw' ? 'action.out-of-turn' : 'action.not-current-opportunity',
        `${intentKind(attempt.action)} 不是当前基础规则提供的操作机会。`,
      ));
    }

    let forceExecute = false;
    let forceReject = false;
    const extraPenalties: PublicPenaltyEffect[] = [];
    for (const delta of context.ruleModules.adjudicate({
      actorId: context.actorId,
      revision: context.revision,
      attempt,
    })) {
      if (delta.waiveViolationCodes?.length) {
        for (let index = violations.length - 1; index >= 0; index -= 1) {
          if (delta.waiveViolationCodes.includes(violations[index].code)) violations.splice(index, 1);
        }
      }
      if (delta.addViolations) violations.push(...delta.addViolations);
      if (delta.addPenalties) extraPenalties.push(...delta.addPenalties);
      forceExecute ||= Boolean(delta.forceExecute);
      forceReject ||= Boolean(delta.forceReject);
    }

    const blocking = violations.some((entry) => entry.blocking);
    const basePenalty = blocking
      ? context.penaltyEngine.propose({
          actorId: context.actorId,
          opponentIds: context.playerIds.filter((id) => id !== context.actorId),
          violationCode: violations[0]?.code ?? 'action.not-current-opportunity',
          violationCount: context.violationCount,
        })
      : [];
    const penalties = [...basePenalty, ...extraPenalties];
    const execute = forceExecute && !forceReject;

    return {
      outcome: execute
        ? penalties.length ? 'executed-with-penalty' : 'executed'
        : penalties.length ? 'rejected-with-penalty' : 'rejected',
      violations,
      penalties,
    };
  }
}
