import Majiang from '@kobalab/majiang-core';
import AIPlayer from '@kobalab/majiang-ai';
import type { GameActionRequest, GameSnapshot, PlayerSummary, Seat } from '@mahjongplus/shared';
import { SEATS } from '@mahjongplus/shared';
import { RemotePlayer } from './remotePlayer.js';

interface GameHostOptions {
  players: PlayerSummary[];
  rule: Record<string, unknown>;
  timeoutSeconds: number;
  onUpdate: () => void;
  onFinish: (paipu: any) => void;
}

function tilesFromString(value: string): string[] {
  const concealed = value.split(',')[0].replace(/\*$/, '');
  const tiles: string[] = [];
  for (const group of concealed.match(/[mpsz]\d+/g) ?? []) {
    const suit = group[0];
    for (const digit of group.slice(1)) tiles.push(`${suit}${digit}`);
  }
  return tiles;
}

function roundLabel(zhuangfeng: number, jushu: number) {
  return `${['东', '南', '西', '北'][zhuangfeng] ?? '?'}${jushu + 1}局`;
}

export class GameHost {
  private readonly game: any;
  private readonly remotes = new Map<string, RemotePlayer>();
  private readonly requests = new Map<string, GameActionRequest | null>();
  private lastEvent = '牌局准备中';
  private result: GameSnapshot['result'];

  constructor(private readonly options: GameHostOptions) {
    const enginePlayers = options.players.map((player) => {
      if (player.isBot) return new AIPlayer();
      const remote = new RemotePlayer({
        timeoutSeconds: options.timeoutSeconds,
        onEvent: (message) => {
          this.lastEvent = this.describeEvent(message as any);
          queueMicrotask(options.onUpdate);
        },
        onRequest: (request) => {
          this.requests.set(player.id, request);
          options.onUpdate();
        },
      });
      this.remotes.set(player.id, remote);
      return remote;
    });

    this.game = new Majiang.Game(enginePlayers, (paipu: any) => {
      const scores = Object.fromEntries(options.players.map((player, index) => [player.id, paipu.defen[index]]));
      const ranks = [...options.players]
        .map((player, index) => ({ id: player.id, score: paipu.defen[index] }))
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.id);
      this.result = { scores, ranks };
      this.lastEvent = '牌局结束';
      options.onUpdate();
      options.onFinish(paipu);
    }, options.rule, 'MahjongPlus');
    this.game.model.player = options.players.map((player) => player.name);
    this.game.speed = 0;
  }

  start() {
    this.game.kaiju(0);
  }

  respond(playerId: string, requestId: string, optionId: string) {
    return this.remotes.get(playerId)?.respond(requestId, optionId) ?? false;
  }

  disconnect(playerId: string) {
    this.remotes.get(playerId)?.cancel();
  }

  snapshot(forPlayerId: string): GameSnapshot {
    const model = this.game.model;
    const windByEngineId = new Map<number, Seat>();
    for (let wind = 0; wind < 4; wind++) windByEngineId.set(model.player_id[wind], SEATS[wind]);

    const players = this.options.players.map((player, engineId) => {
      const hand = model.shoupai?.find ? model.shoupai[windByEngineId.has(engineId) ? model.player_id.indexOf(engineId) : engineId] : undefined;
      const wind = model.player_id?.indexOf(engineId) ?? engineId;
      const shoupai = wind >= 0 ? model.shoupai?.[wind] : undefined;
      const handString = shoupai?.toString?.() ?? '';
      const allTiles = tilesFromString(handString);
      return {
        playerId: player.id,
        name: player.name,
        currentSeat: (windByEngineId.get(engineId) ?? SEATS[engineId]) as Seat,
        score: model.defen?.[engineId] ?? Number((this.options.rule as any)['配給原点'] ?? 25000),
        handCount: allTiles.length,
        hand: player.id === forPlayerId ? allTiles : undefined,
        melds: shoupai?._fulou ? [...shoupai._fulou] : [],
        river: wind >= 0 && model.he?.[wind]?._pai ? [...model.he[wind]._pai] : [],
        riichi: Boolean(shoupai?.lizhi),
      };
    });

    return {
      round: roundLabel(model.zhuangfeng ?? 0, model.jushu ?? 0),
      honba: model.changbang ?? 0,
      riichiSticks: model.lizhibang ?? 0,
      remainingTiles: model.shan?.paishu ?? 70,
      doraIndicators: model.shan?.baopai ? [...model.shan.baopai] : [],
      players,
      actionRequest: this.requests.get(forPlayerId) ?? null,
      lastEvent: this.lastEvent,
      result: this.result,
    };
  }

  private describeEvent(message: any) {
    if (message?.qipai) return `${roundLabel(message.qipai.zhuangfeng, message.qipai.jushu)} 配牌`;
    if (message?.zimo) return `${SEATS[message.zimo.l]} 摸牌`;
    if (message?.gangzimo) return `${SEATS[message.gangzimo.l]} 岭上摸牌`;
    if (message?.dapai) return `${SEATS[message.dapai.l]} 打 ${message.dapai.p}`;
    if (message?.fulou) return `${SEATS[message.fulou.l]} 副露 ${message.fulou.m}`;
    if (message?.gang) return `${SEATS[message.gang.l]} 杠 ${message.gang.m}`;
    if (message?.hule) return `${SEATS[message.hule.l]} 和牌`;
    if (message?.pingju) return `流局：${message.pingju.name}`;
    if (message?.kaigang) return `新宝牌指示牌 ${message.kaigang.baopai}`;
    return this.lastEvent;
  }
}
