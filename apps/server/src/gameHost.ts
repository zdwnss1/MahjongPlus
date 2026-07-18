import AIPlayer from '@kobalab/majiang-ai';
import type {
  ActionAttempt,
  ActionIntent,
  ActionReceipt,
  GameActionRequest,
  GameSnapshot,
  PenaltyPolicy,
  PlayerSummary,
  Seat,
  TileInstanceView,
} from '@mahjongplus/shared';
import { SEATS } from '@mahjongplus/shared';
import { describeEngineEvent, eventSignature, roundLabel } from './engine/engineEvents.js';
import { RuleAwareMajiangGame } from './engine/ruleAwareGame.js';
import { RemotePlayer } from './remotePlayer.js';
import type { InternalActionOption, InternalActionRequest } from './gameTypes.js';
import { ActionAdjudicator } from './kernel/adjudicator.js';
import { AttemptReceiptStore } from './kernel/attemptReceipts.js';
import { ACTION_CATALOG } from './kernel/catalog.js';
import { EngineTileProjector } from './kernel/engineProjection.js';
import { EventJournal } from './kernel/journal.js';
import { PenaltyEngine } from './kernel/penalties.js';
import { DeterministicRandom } from './kernel/random.js';
import { RuleModuleRegistry, type ActionRuleModule } from './kernel/ruleModules.js';
import { applyScoreEffects } from './kernel/scoreEffects.js';
import { createStandardTileSet, type TileSetDefinition } from './kernel/tileSet.js';

interface GameHostOptions {
  players: PlayerSummary[];
  rule: Record<string, unknown>;
  timeoutSeconds: number;
  penaltyPolicy: PenaltyPolicy;
  seed: string;
  tileSet?: TileSetDefinition;
  ruleModules?: ActionRuleModule[];
  onUpdate: () => void;
  onFinish: (paipu: any) => void;
}

export class GameHost {
  private readonly game: any;
  private readonly remotes = new Map<string, RemotePlayer>();
  private readonly requests = new Map<string, InternalActionRequest | null>();
  private readonly tileSet: TileSetDefinition;
  private readonly projector: EngineTileProjector;
  private readonly adjudicator = new ActionAdjudicator();
  private readonly penaltyEngine: PenaltyEngine;
  private readonly ruleModules: RuleModuleRegistry;
  private readonly journal = new EventJournal();
  private readonly receipts = new AttemptReceiptStore();
  private readonly revealedHands = new Set<string>();
  private readonly violationCounts = new Map<string, number>();
  private lastEvent = '牌局准备中';
  private result: GameSnapshot['result'];
  private revision = 0;
  private lastSignature = '';
  private lastSignatureAt = 0;

  constructor(private readonly options: GameHostOptions) {
    const red = (options.rule['赤牌'] ?? { m: 1, p: 1, s: 1 }) as Partial<Record<'m' | 'p' | 's', number>>;
    this.tileSet = options.tileSet ?? createStandardTileSet({ redFives: red });
    this.projector = new EngineTileProjector(options.players, this.tileSet);
    this.penaltyEngine = new PenaltyEngine(options.penaltyPolicy);
    this.ruleModules = new RuleModuleRegistry(options.ruleModules);

    const enginePlayers = options.players.map((player) => {
      if (player.isBot) return new AIPlayer();
      const remote = new RemotePlayer({
        timeoutSeconds: options.timeoutSeconds,
        onEvent: (message) => this.recordEngineEvent(message),
        onRequest: (request) => {
          this.requests.set(player.id, request);
          this.bumpRevision('opportunity.changed', { playerId: player.id, requestId: request?.id ?? null });
          options.onUpdate();
        },
      });
      this.remotes.set(player.id, remote);
      return remote;
    });

    this.game = new RuleAwareMajiangGame(enginePlayers, (paipu: any) => {
      const scores = Object.fromEntries(options.players.map((player, index) => [player.id, paipu.defen[index]]));
      const ranks = [...options.players]
        .map((player, index) => ({ id: player.id, score: paipu.defen[index] }))
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.id);
      this.result = { scores, ranks };
      this.lastEvent = 'g��局结束';
      this.bumpRevision('match.finished', this.result);
      options.onUpdate();
      options.onFinish(paipu);
    }, options.rule, 'MahjongPlus', new DeterministicRandom(options.seed).fork('wall'), this.tileSet);
    this.game.model.player = options.players.map((player) => player.name);
    this.game.speed = 0;
  }

  start() {
    this.journal.append('match.started', { seed: this.options.seed, tileSet: this.tileSet.id });
    this.game.kaiju(0);
  }

  attempt(playerId: string, attempt: ActionAttempt): ActionReceipt {
    const duplicate = this.receipts.get(attempt.attemptId);
    if (duplicate) return duplicate;

    const locations = this.projector.capture(this.game.model);
    const hand = locations.get(`hand:${playerId}`) ?? [];
    const request = this.requests.get(playerId) ?? null;
    const opportunities = this.materializeOptions(request?.options ?? [], hand);
    const revisionBefore = this.revision;
    this.journal.append('action.attempted', attempt, playerId);

    const result = this.adjudicator.adjudicate({
      actorId: playerId,
      playerIds: this.options.players.map((player) => player.id),
      revision: this.revision,
      attempt,
      opportunities,
      hand,
      violationCount: this.violationCounts.get(playerId) ?? 0,
      penaltyEngine: this.penaltyEngine,
      ruleModules: this.ruleModules,
    });

    committedEventIds: string[] = [];
    if (result.violations.length && result.outcome !== 'stale' && result.outcome !== 'invalid') {
      this.violationCounts.set(playerId, (this.violationCounts.get(playerId) ?? 0) + 1);
      committedEventIds.push(this.journal.append('violation.committed', result.violations, playerId).id);
    }
    if (result.penalties.length) {
      applyScoreEffects(this.game.model, this.options.players.map((player) => player.id), result.penalties);
      committedEventIds.push(this.journal.append('penalty.committed', result.penalties, playerId).id);
    }
    if (result.executeBuiltin === 'reveal-hand') {
      this.revealedHands.add(playerId);
      committedEventIds.push(this.journal.append('hand.revealed', {}, playerId).id);
    }
    if (result.executeOption && request) {
      const executed = this.remotes.get(playerId)?.respond(request.id, result.executeOption.id) ?? false;
      if (executed) committedEventIds.push(this.journal.append('action.committed', result.executeOption.intent, playerId).id);
    }

    if (result.outcome !== 'stale') this.revision += 1;
    const receipt: ActionReceipt = {
      attemptId: attempt.attemptId,
      actorId: playerId,
      action: attempt.action,
      outcome: result.outcome,
      revisionBefore,
      revisionAfter: this.revision,
      violations: result.violations,
      penalties: result.penalties,
      committedEventIds,
      createdAt: new Date().toISOString(),
    };
    this.receipts.record(receipt);
    this.options.onUpdate();
    return receipt;
  }

  disconnect(playerId: string) {
    this.remotes.get(playerId)?.cancel();
  }

  snapshot(forPlayerId: string): GameSnapshot {
    const model = this.game.model;
    const locations = this.projector.capture(model);
    const windByEngineId = new Map<number, Seat>();
    for (let wind = 0; wind < 4; wind += 1) windByEngineId.set(model.player_id[wind], SEATS[wind]);

    const players = this.options.players.map((player, engineId) => {
      const wind = model.player_id?.indexOf(engineId) ?? engineId;
      const shoupai = wind >= 0 ? model.shoupai?.[wind] : undefined;
      const hand = locations.get(`hand:${player.id}`) ?? [];
      const river = locations.get(`river:${player.id}`) ?? [];
      const visible = player.id === forPlayerId || this.revealedHands.has(player.id);
      return {
        playerId: player.id,
        name: player.name,
        currentSeat: (windByEngineId.get(engineId) ?? SEATS[engineId]) as Seat,
        score: model.defen?.[engineId] ?? Number((this.options.rule as any)['配給原点'] ?? 25000),
        handCount: hand.length,
        hand: visible ? hand : undefined,
        melds: shoupai?._fulou ? [...shoupai._fulou] : [],
        river,
        riichi: Boolean(shoupai?.lizhi),
        handRevealed: this.revealedHands.has(player.id),
        violationCount: this.violationCounts.get(player.id) ?? 0,
      };
    });

    const ownHand = locations.get(`hand:${forPlayerId}`) ?? [];
    const request = this.requests.get(forPlayerId) ?? null;
    return {
      revision: this.revision,
      round: roundLabel(model.zhuangfeng ?? 0, model.jushu ?? 0),
      honba: model.changbang ?? 0,
      riichiSticks: model.lizhibang ?? 0,
      remainingTiles: model.shan?.paishu ?? 70,
      doraIndicators: locations.get('dora') ?? [],
      players,
      actionRequest: request ? {
        id: request.id,
        prompt: request.prompt,
        expiresAt: request.expiresAt,
        options: this.materializeOptions(request.options, ownHand).map(({ reply: _reply, ...option }) => option),
      } satisfies GameActionRequest : null,
      actionCatalog: ACTION_CATALOG,
      recentReceipts: this.receipts.recentNewestFirst(),
      lastEvent: this.lastEvent,
      result: this.result,
    };
  }

  private materializeOptions(options: InternalActionOption[], hand: TileInstanceView[]): InternalActionOption[] {
    return options.map((option) => {
      const intent = option.intent;
      if (intent.type !== 'discard' && intent.type !== 'riichi') return option;
      const tile = hand.find((candidate) => candidate.face === intent.tileId);
      return tile ? { ...option, intent: { ...intent, tileId: tile.id } as ActionIntent } : option;
    });
  }

  private recordEngineEvent(message: unknown) {
    const signature = eventSignature(message as any);
    const now = Date.now();
    if (signature === this.lastSignature && now - this.lastSignatureAt <= 25) return;
    this.lastSignature = signature;
    this.lastSignatureAt = now;
    if ((message as any)?.qipai) this.revealedHands.clear();
    this.lastEvent = describeEngineEvent(message as any, this.lastEvent);
    this.bumpRevision('engine.event', { signature, label: this.lastEvent });
    this.options.onUpdate();
  }

  private bumpRevision(type: string, payload: unknown) {
    this.revision += 1;
    this.journal.append(type, payload);
  }
}
