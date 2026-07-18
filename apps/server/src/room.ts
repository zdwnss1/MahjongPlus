import { nanoid } from 'nanoid';
import type { Ack, MatchConstitution, RoomState, RuleArtifact, RuleVote, SessionIdentity } from '@mahjongplus/shared';
import { SEATS } from '@mahjongplus/shared';
import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import { PROFILES } from './profiles.js';
import { GameHost } from './gameHost.js';
import { RecordingRuleCompiler, type RuleCompilerPort } from './ruleCompiler.js';

interface PlayerRecord {
  id: string;
  token: string;
  name: string;
  isBot: boolean;
  socketId: string | null;
}

const constitutionSchema = z.object({
  baseProfile: z.enum(['tenhou', 'mleague']),
  matchLength: z.enum(['east', 'hanchan']),
  initialScore: z.number().int().min(1000).max(1_000_000_000),
  bankruptcy: z.boolean(),
  ruleSlotsPerPlayer: z.number().int().min(0).max(5),
  actionTimeoutSeconds: z.number().int().min(10).max(180),
});

function shuffled<T>(items: T[]) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

export class Room {
  readonly code: string;
  private phase: RoomState['phase'] = 'lobby';
  private players: PlayerRecord[] = [];
  private hostId = '';
  private seats: string[] = [];
  private constitution: MatchConstitution = {
    baseProfile: 'tenhou',
    matchLength: 'east',
    initialScore: 25000,
    bankruptcy: true,
    ruleSlotsPerPlayer: 1,
    actionTimeoutSeconds: 45,
  };
  private confirmations = new Set<string>();
  private acceptedRules: RuleArtifact[] = [];
  private governance: RoomState['governance'] = null;
  private game: GameHost | null = null;
  private notice: string | null = null;
  private lastRosterSignature = '';

  constructor(private readonly io: Server, code?: string, private readonly compiler: RuleCompilerPort = new RecordingRuleCompiler()) {
    this.code = code ?? nanoid(6).toUpperCase();
  }

  createHost(name: string): SessionIdentity {
    const player = this.makePlayer(name, false);
    this.players.push(player);
    this.hostId = player.id;
    return { roomCode: this.code, playerId: player.id, token: player.token };
  }

  join(name: string): SessionIdentity {
    if (this.phase !== 'lobby') throw new Error('牌桌已经开始，不能加入新玩家。');
    if (this.players.length >= 4) throw new Error('房间已满。');
    const player = this.makePlayer(name, false);
    this.players.push(player);
    this.emitAll();
    return { roomCode: this.code, playerId: player.id, token: player.token };
  }

  attach(socket: Socket, playerId: string, token: string) {
    const player = this.players.find((candidate) => candidate.id === playerId && candidate.token === token);
    if (!player || player.isBot) throw new Error('身份无效。');
    player.socketId = socket.id;
    socket.data.roomCode = this.code;
    socket.data.playerId = player.id;
    this.emitAll();
  }

  detach(socketId: string) {
    const player = this.players.find((candidate) => candidate.socketId === socketId);
    if (!player) return;
    player.socketId = null;
    this.game?.disconnect(player.id);
    this.emitAll();
  }

  addBots(actorId: string) {
    this.assertHost(actorId);
    if (this.phase !== 'lobby') throw new Error('只能在大厅补充机器人。');
    while (this.players.length < 4) this.players.push(this.makePlayer(`Bot ${this.players.length + 1}`, true));
    this.emitAll();
  }

  beginConstitution(actorId: string) {
    this.assertHost(actorId);
    if (this.phase !== 'lobby') throw new Error('当前不能开始立宪。');
    if (this.players.length !== 4) throw new Error('需要正好四名玩家。');
    this.seats = shuffled(this.players.map((player) => player.id));
    this.lastRosterSignature = [...this.players.map((player) => player.id)].sort().join(':');
    this.phase = 'constitution';
    this.confirmations = new Set(this.players.filter((player) => player.isBot).map((player) => player.id));
    this.notice = '座位已随机。房主设置不可被村规修改的赛前宪法。';
    this.emitAll();
  }

  updateConstitution(actorId: string, input: unknown) {
    this.assertHost(actorId);
    if (this.phase !== 'constitution') throw new Error('当前不在立宪阶段。');
    this.constitution = Object.freeze(constitutionSchema.parse(input));
    this.confirmations = new Set(this.players.filter((player) => player.isBot).map((player) => player.id));
    this.notice = '宪法已更新，真人玩家需要重新确认。';
    this.emitAll();
  }

  confirmConstitution(actorId: string) {
    if (this.phase !== 'constitution') throw new Error('当前不在立宪阶段。');
    this.getPlayer(actorId);
    this.confirmations.add(actorId);
    this.emitAll();
  }

  lockConstitution(actorId: string) {
    this.assertHost(actorId);
    if (this.phase !== 'constitution') throw new Error('当前不在立宪阶段。');
    if (this.confirmations.size !== 4) throw new Error('所有玩家尚未确认宪法。');
    this.acceptedRules = [];
    this.phase = 'governance';
    this.governance = {
      proposerId: this.seats[0],
      proposerSeat: 'east',
      slot: 1,
      totalSlots: this.constitution.ruleSlotsPerPlayer,
      skippedAllPlayerIds: [],
      proposal: null,
    };
    this.notice = '宪法冻结。开始按东、南、西、北顺序制定规则。';
    this.normalizeGovernance();
    this.emitAll();
  }

  async submitRule(actorId: string, text: string) {
    const governance = this.requireGovernance();
    if (governance.proposerId !== actorId) throw new Error('现在不是你的规则位。');
    if (governance.proposal) throw new Error('当前已有待处理提案。');
    const compilation = await this.compiler.compile(text, {
      constitution: this.constitution,
      acceptedRules: this.acceptedRules,
      authorId: actorId,
      slot: governance.slot,
    });
    if (!compilation.ok) {
      this.notice = `技术驳回：${compilation.reason}`;
      this.emitAll();
      return;
    }
    const voters = this.players.filter((player) => player.id !== actorId);
    const votes = Object.fromEntries(voters.map((player) => [player.id, player.isBot ? 'approve' : null])) as Record<string, RuleVote | null>;
    governance.proposal = {
      id: nanoid(10),
      authorId: actorId,
      text: text.trim(),
      votes,
      stage: 'voting',
      candidate: compilation.artifact,
    };
    this.resolveVotesIfReady();
    this.emitAll();
  }

  voteRule(actorId: string, vote: RuleVote) {
    const governance = this.requireGovernance();
    const proposal = governance.proposal;
    if (!proposal || proposal.stage !== 'voting') throw new Error('当前没有可投票的提案。');
    if (proposal.authorId === actorId) throw new Error('提案者不能投票。');
    if (!(actorId in proposal.votes)) throw new Error('你没有本次投票权。');
    proposal.votes[actorId] = vote;
    this.resolveVotesIfReady();
    this.emitAll();
  }

  confirmRule(actorId: string) {
    const governance = this.requireGovernance();
    const proposal = governance.proposal;
    if (!proposal || proposal.stage !== 'author-confirmation' || proposal.authorId !== actorId || !proposal.candidate) {
      throw new Error('当前没有需要你确认的候选规则。');
    }
    this.acceptedRules.push(proposal.candidate);
    this.notice = '规则已发布；MVP 将其保存为非执行 artifact。';
    governance.proposal = null;
    this.advanceSlot();
    this.emitAll();
  }

  skipRule(actorId: string, all: boolean) {
    const governance = this.requireGovernance();
    if (governance.proposerId !== actorId || governance.proposal) throw new Error('当前不能跳过。');
    if (all && !governance.skippedAllPlayerIds.includes(actorId)) governance.skippedAllPlayerIds.push(actorId);
    this.notice = all ? '已跳过自己的全部剩余规则位。' : '已跳过当前规则位。';
    this.advanceSlot();
    this.emitAll();
  }

  gameAction(actorId: string, requestId: string, optionId: string) {
    if (this.phase !== 'playing' || !this.game) throw new Error('当前没有进行中的牌局。');
    if (!this.game.respond(actorId, requestId, optionId)) throw new Error('动作已过期或不合法。');
  }

  nextMatch(actorId: string) {
    this.assertHost(actorId);
    if (this.phase !== 'finished') throw new Error('当前不能开始下一场。');
    const rosterSignature = [...this.players.map((player) => player.id)].sort().join(':');
    if (rosterSignature !== this.lastRosterSignature) throw new Error('人员已变化，需要重新随机座位。');
    this.seats = [...this.seats.slice(1), this.seats[0]];
    this.acceptedRules = [];
    this.phase = 'governance';
    this.governance = {
      proposerId: this.seats[0],
      proposerSeat: 'east',
      slot: 1,
      totalSlots: this.constitution.ruleSlotsPerPlayer,
      skippedAllPlayerIds: [],
      proposal: null,
    };
    this.notice = '下一场沿用宪法，原南家成为东家，重新制定本场规则。';
    this.normalizeGovernance();
    this.emitAll();
  }

  publicState(forPlayerId: string): RoomState {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        isBot: player.isBot,
        connected: player.isBot || Boolean(player.socketId),
        startingSeat: this.seats.includes(player.id) ? SEATS[this.seats.indexOf(player.id)] : undefined,
      })),
      constitution: this.constitution,
      constitutionConfirmedBy: [...this.confirmations],
      governance: this.governance,
      acceptedRules: this.acceptedRules,
      game: this.game?.snapshot(forPlayerId) ?? null,
      notice: this.notice,
    };
  }

  emitAll() {
    for (const player of this.players) {
      if (player.socketId) this.io.to(player.socketId).emit('room:state', this.publicState(player.id));
    }
  }

  private makePlayer(name: string, isBot: boolean): PlayerRecord {
    const cleanName = name.trim().slice(0, 30) || (isBot ? 'Bot' : 'Player');
    return { id: nanoid(12), token: nanoid(24), name: cleanName, isBot, socketId: null };
  }

  private getPlayer(id: string) {
    const player = this.players.find((candidate) => candidate.id === id);
    if (!player) throw new Error('玩家不存在。');
    return player;
  }

  private assertHost(id: string) {
    if (id !== this.hostId) throw new Error('只有房主可以执行此操作。');
  }

  private requireGovernance() {
    if (this.phase !== 'governance' || !this.governance) throw new Error('当前不在规则制定阶段。');
    return this.governance;
  }

  private resolveVotesIfReady() {
    const governance = this.requireGovernance();
    const proposal = governance.proposal;
    if (!proposal || proposal.stage !== 'voting') return;
    const votes = Object.values(proposal.votes);
    if (votes.some((vote) => vote === null)) return;
    if (votes.every((vote) => vote === 'reject')) {
      this.notice = '三名非提案者一致反对，提案被驳回；当前规则位仍可重新提交。';
      governance.proposal = null;
      return;
    }
    proposal.stage = 'author-confirmation';
    this.notice = '提案未被一致驳回，等待作者确认规范化 artifact。';
  }

  private advanceSlot() {
    const governance = this.requireGovernance();
    governance.slot += 1;
    if (governance.slot > governance.totalSlots) {
      const proposerIndex = governance.proposerId ? this.seats.indexOf(governance.proposerId) : -1;
      const nextIndex = proposerIndex + 1;
      if (nextIndex >= this.seats.length) {
        this.freezeAndStartGame();
        return;
      }
      governance.proposerId = this.seats[nextIndex];
      governance.proposerSeat = SEATS[nextIndex];
      governance.slot = 1;
    }
    this.normalizeGovernance();
  }

  private normalizeGovernance() {
    if (this.phase !== 'governance' || !this.governance) return;
    const governance = this.governance;
    if (governance.totalSlots === 0) return this.freezeAndStartGame();
    while (governance.proposerId) {
      const player = this.getPlayer(governance.proposerId);
      if (!player.isBot && !governance.skippedAllPlayerIds.includes(player.id)) break;
      if (player.isBot && !governance.skippedAllPlayerIds.includes(player.id)) governance.skippedAllPlayerIds.push(player.id);
      const index = this.seats.indexOf(player.id) + 1;
      if (index >= this.seats.length) return this.freezeAndStartGame();
      governance.proposerId = this.seats[index];
      governance.proposerSeat = SEATS[index];
      governance.slot = 1;
    }
  }

  private freezeAndStartGame() {
    this.phase = 'playing';
    this.governance = null;
    this.notice = '规则包已冻结，运行时不再调用 LLM。';
    const orderedPlayers = this.seats.map((id) => this.getPlayer(id));
    const rule = PROFILES[this.constitution.baseProfile].build(this.constitution);
    this.game = new GameHost({
      players: orderedPlayers.map((player, index) => ({
        id: player.id,
        name: player.name,
        isBot: player.isBot,
        connected: player.isBot || Boolean(player.socketId),
        startingSeat: SEATS[index],
      })),
      rule,
      timeoutSeconds: this.constitution.actionTimeoutSeconds,
      onUpdate: () => this.emitAll(),
      onFinish: () => {
        this.phase = 'finished';
        this.notice = '本场结束。若人员不变，下一场由原南家成为东家。';
        this.emitAll();
      },
    });
    queueMicrotask(() => this.game?.start());
  }
}

export class RoomStore {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly io: Server) {}

  create(name: string) {
    let room: Room;
    do room = new Room(this.io); while (this.rooms.has(room.code));
    this.rooms.set(room.code, room);
    return { room, identity: room.createHost(name) };
  }

  join(code: string, name: string) {
    const room = this.get(code);
    return { room, identity: room.join(name) };
  }

  get(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error('房间不存在。');
    return room;
  }
}

export function safeAck<T>(callback: ((ack: Ack<T>) => void) | undefined, action: () => T | Promise<T>) {
  Promise.resolve().then(action).then((data) => callback?.({ ok: true, data })).catch((error: unknown) => {
    callback?.({ ok: false, error: error instanceof Error ? error.message : '未知错误' });
  });
}
