import Majiang from '@kobalab/majiang-core';
import { nanoid } from 'nanoid';
import type { InternalActionOption, InternalActionRequest } from './gameTypes.js';

interface RemotePlayerHooks {
  onEvent: (message: unknown) => void;
  onRequest: (request: InternalActionRequest | null) => void;
  timeoutSeconds: number;
}

export class RemotePlayer extends Majiang.Player {
  private pending: null | {
    requestId: string;
    callback: (reply?: Record<string, string>) => void;
    options: InternalActionOption[];
    timer: NodeJS.Timeout;
  } = null;

  constructor(private readonly hooks: RemotePlayerHooks) {
    super();
  }

  action(msg: unknown, callback?: (reply?: Record<string, string>) => void) {
    this.hooks.onEvent(msg);
    super.action(msg, callback);
  }

  respond(requestId: string, optionId: string): boolean {
    if (!this.pending || this.pending.requestId !== requestId) return false;
    const option = this.pending.options.find((candidate) => candidate.id === optionId);
    if (!option) return false;
    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    this.hooks.onRequest(null);
    pending.callback(option.reply);
    return true;
  }

  cancel() {
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = null;
    clearTimeout(pending.timer);
    this.hooks.onRequest(null);
    pending.callback({});
  }

  private request(prompt: string, options: InternalActionOption[]) {
    const callback = this._callback as (reply?: Record<string, string>) => void;
    if (!callback) return;
    if (options.length === 0) return callback({});
    const requestId = nanoid(10);
    const expiresAt = Date.now() + this.hooks.timeoutSeconds * 1000;
    const timer = setTimeout(() => {
      if (!this.pending || this.pending.requestId !== requestId) return;
      const fallback = options.find((option) => option.kind === 'pass') ?? options.find((option) => option.kind === 'discard') ?? options[0];
      this.pending = null;
      this.hooks.onRequest(null);
      callback(fallback.reply);
    }, this.hooks.timeoutSeconds * 1000);
    this.pending = { requestId, callback, options, timer };
    this.hooks.onRequest({ id: requestId, prompt, expiresAt, options });
  }

  action_kaiju() { this._callback({}); }
  action_qipai() { this._callback({}); }

  action_zimo(zimo: any, gangzimo: boolean) {
    if (zimo.l !== this._menfeng) return this._callback({});
    const options: InternalActionOption[] = [];
    if (this.allow_hule(this.shoupai, null, gangzimo)) {
      options.push({ id: 'tsumo', label: '自摸', kind: 'tsumo', intent: { type: 'win', mode: 'tsumo' }, reply: { hule: '-' } });
    }
    if (this.allow_pingju(this.shoupai)) {
      options.push({ id: 'abort', label: '九种九牌', kind: 'abortive-draw', intent: { type: 'abortive-draw', declaration: 'nine-terminals' }, reply: { daopai: '-' } });
    }
    for (const meld of this.get_gang_mianzi(this.shoupai) ?? []) {
      const kind = /^[mpsz]\d{4}$/.test(meld) ? 'closed-kan' : 'added-kan';
      options.push({ id: `kan:${meld}`, label: `杠 ${meld}`, kind, intent: { type: 'kan', kind, meld }, reply: { gang: meld } });
    }
    const discards: string[] = this.get_dapai(this.shoupai) ?? [];
    const riichi = new Set<string>((this.allow_lizhi(this.shoupai) || []) as string[]);
    for (const tile of discards) {
      options.push({ id: `discard:${tile}`, label: `打 ${tile}`, kind: 'discard', intent: { type: 'discard', tileId: tile }, reply: { dapai: tile } });
      if (riichi.has(tile)) {
        options.push({ id: `riichi:${tile}`, label: `立直，打 ${tile}`, kind: 'riichi', intent: { type: 'riichi', tileId: tile }, reply: { dapai: `${tile}*` } });
      }
    }
    this.request('请选择摸牌后的动作', options);
  }

  action_dapai(dapai: any) {
    if (dapai.l === this._menfeng) {
      if (this.allow_no_daopai(this.shoupai)) {
        return this.request('流局时是否公开听牌', [
          { id: 'reveal', label: '公开听牌', kind: 'reveal-hand', intent: { type: 'reveal-hand' }, reply: { daopai: '-' } },
          { id: 'pass', label: '不公开', kind: 'pass', intent: { type: 'pass' }, reply: {} },
        ]);
      }
      return this._callback({});
    }

    const direction = ['', '+', '=', '-'][(4 + this._model.lunban - this._menfeng) % 4];
    const calledTile = `${dapai.p.slice(0, 2)}${direction}`;
    const options: InternalActionOption[] = [
      { id: 'pass', label: '跳过', kind: 'pass', intent: { type: 'pass' }, reply: {} },
    ];
    if (this.allow_hule(this.shoupai, calledTile)) {
      options.unshift({ id: 'ron', label: '荣和', kind: 'ron', intent: { type: 'win', mode: 'ron' }, reply: { hule: '-' } });
    }
    for (const meld of this.get_gang_mianzi(this.shoupai, calledTile) ?? []) {
      options.splice(options.length - 1, 0, { id: `kan:${meld}`, label: `大明杠 ${meld}`, kind: 'open-kan', intent: { type: 'call', kind: 'open-kan', meld }, reply: { fulou: meld } });
    }
    for (const meld of this.get_peng_mianzi(this.shoupai, calledTile) ?? []) {
      options.splice(options.length - 1, 0, { id: `pon:${meld}`, label: `碰 ${meld}`, kind: 'pon', intent: { type: 'call', kind: 'pon', meld }, reply: { fulou: meld } });
    }
    for (const meld of this.get_chi_mianzi(this.shoupai, calledTile) ?? []) {
      options.splice(options.length - 1, 0, { id: `chi:${meld}`, label: `吃 ${meld}`, kind: 'chi', intent: { type: 'call', kind: 'chi', meld }, reply: { fulou: meld } });
    }
    if (options.length === 1) return this._callback({});
    this.request(`他家打出 ${dapai.p}`, options);
  }

  action_fulou(fulou: any) {
    if (fulou.l !== this._menfeng || /^[mpsz]\d{4}/.test(fulou.m)) return this._callback({});
    const options: InternalActionOption[] = (this.get_dapai(this.shoupai) ?? []).map((tile: string) => ({
      id: `discard:${tile}`,
      label: `打 ${tile}`,
      kind: 'discard' as const,
      intent: { type: 'discard' as const, tileId: tile },
      reply: { dapai: tile },
    }));
    this.request('副露后请选择弃牌', options);
  }

  action_gang(gang: any) {
    if (gang.l === this._menfeng) return this._callback({});
    if (this.allow_hule(this.shoupai, `${gang.m[0]}${gang.m.slice(-1)}${['', '+', '=', '-'][(4 + this._model.lunban - this._menfeng) % 4]}`, true)) {
      return this.request('是否抢杠', [
        { id: 'ron', label: '抢杠荣和', kind: 'ron', intent: { type: 'win', mode: 'ron' }, reply: { hule: '-' } },
        { id: 'pass', label: '跳过', kind: 'pass', intent: { type: 'pass' }, reply: {} },
      ]);
    }
    this._callback({});
  }

  action_hule() { this._callback({}); }
  action_pingju() { this._callback({}); }
  action_jieju() { this._callback({}); }
}
