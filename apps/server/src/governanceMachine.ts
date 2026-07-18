import { nanoid } from 'nanoid';
import type { GovernanceState, MatchConstitution, RuleArtifact, RuleVote } from '@mahjongplus/shared';
import { SEATS } from '@mahjongplus/shared';
import type { RuleCompilerPort } from './ruleCompiler.js';

export interface GovernancePlayer { id: string; isBot: boolean; }
export interface GovernanceResult { notice: string; finished: boolean; }

export class GovernanceMachine {
  readonly acceptedRules: RuleArtifact[] = [];
  readonly state: GovernanceState;

  constructor(
    private readonly players: GovernancePlayer[],
    private readonly seats: string[],
    private readonly constitution: MatchConstitution,
    private readonly compiler: RuleCompilerPort,
  ) {
    this.state = {
      proposerId: seats[0] ?? null,
      proposerSeat: 'east',
      slot: 1,
      totalSlots: constitution.ruleSlotsPerPlayer,
      skippedAllPlayerIds: [],
      proposal: null,
    };
  }

  normalize(): GovernanceResult {
    if (this.state.totalSlots === 0) return { notice: '规则位为 0，规则包直接冻结。', finished: true };
    while (this.state.proposerId) {
      const player = this.player(this.state.proposerId);
      if (!player.isBot && !this.state.skippedAllPlayerIds.includes(player.id)) break;
      if (!this.state.skippedAllPlayerIds.includes(player.id)) this.state.skippedAllPlayerIds.push(player.id);
      const next = this.seats.indexOf(player.id) + 1;
      if (next >= this.seats.length) return { notice: '所有规则位处理完成。', finished: true };
      this.state.proposerId = this.seats[next];
      this.state.proposerSeat = SEATS[next];
      this.state.slot = 1;
    }
    return { notice: '等待当前玩家提出规则或跳过。', finished: false };
  }

  async submit(actorId: string, text: string): Promise<GovernanceResult> {
    if (this.state.proposerId !== actorId) throw new Error('现在不是你的规则位。');
    if (this.state.proposal) throw new Error('当前已有待处理提案。');
    const compilation = await this.compiler.compile(text, {
      constitution: this.constitution,
      acceptedRules: this.acceptedRules,
      authorId: actorId,
      slot: this.state.slot,
    });
    if (!compilation.ok) return { notice: `技术驳回：${compilation.reason}`, finished: false };
    const voters = this.players.filter((player) => player.id !== actorId);
    const votes = Object.fromEntries(voters.map((player) => [player.id, player.isBot ? 'approve' : null])) as Record<string, RuleVote | null>;
    this.state.proposal = { id: nanoid(10), authorId: actorId, text: text.trim(), votes, stage: 'voting', candidate: compilation.artifact };
    return this.resolveVotes();
  }

  vote(actorId: string, vote: RuleVote): GovernanceResult {
    const proposal = this.state.proposal;
    if (!proposal || proposal.stage !== 'voting') throw new Error('当前没有可投票的提案。');
    if (proposal.authorId === actorId) throw new Error('提案者不能投票。');
    if (!(actorId in proposal.votes)) throw new Error('你没有本次投票权。');
    proposal.votes[actorId] = vote;
    return this.resolveVotes();
  }

  confirm(actorId: string): GovernanceResult {
    const proposal = this.state.proposal;
    if (!proposal || proposal.stage !== 'author-confirmation' || proposal.authorId !== actorId || !proposal.candidate) throw new Error('当前没有需要你确认的候选规则。');
    this.acceptedRules.push(proposal.candidate);
    this.state.proposal = null;
    return this.advance('规则已发布；当前仍保存为非执行 artifact。');
  }

  skip(actorId: string, all: boolean): GovernanceResult {
    if (this.state.proposerId !== actorId || this.state.proposal) throw new Error('当前不能跳过。');
    if (all && !this.state.skippedAllPlayerIds.includes(actorId)) this.state.skippedAllPlayerIds.push(actorId);
    return this.advance(all ? '已跳过自己的全部剩余规则位。' : '已跳过当前规则位。');
  }

  private resolveVotes(): GovernanceResult {
    const proposal = this.state.proposal;
    if (!proposal || proposal.stage !== 'voting') return { notice: '等待投票。', finished: false };
    const votes = Object.values(proposal.votes);
    if (votes.some((vote) => vote === null)) return { notice: '等待其余玩家投票。', finished: false };
    if (votes.every((vote) => vote === 'reject')) {
      this.state.proposal = null;
      return { notice: '三名非提案者一致反对，提案被驳回；当前规则位仍可重新提交。', finished: false };
    }
    proposal.stage = 'author-confirmation';
    return { notice: '提案未被一致驳回，等待作者确认规范化 artifact。', finished: false };
  }

  private advance(prefix: string): GovernanceResult {
    this.state.slot += 1;
    if (this.state.slot > this.state.totalSlots) {
      const current = this.state.proposerId ? this.seats.indexOf(this.state.proposerId) : -1;
      const next = current + 1;
      if (next >= this.seats.length) return { notice: `${prefix} 所有规则位处理完成。`, finished: true };
      this.state.proposerId = this.seats[next];
      this.state.proposerSeat = SEATS[next];
      this.state.slot = 1;
    }
    const normalized = this.normalize();
    return { notice: `${prefix} ${normalized.notice}`, finished: normalized.finished };
  }

  private player(id: string): GovernancePlayer {
    const player = this.players.find((candidate) => candidate.id === id);
    if (!player) throw new Error('治理玩家不存在。');
    return player;
  }
}
