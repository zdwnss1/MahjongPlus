import Majiang from '@kobalab/majiang-core';
import type { RandomSource } from './random.js';
import { expandTileSet, type TileSetDefinition } from './tileSet.js';

export class SeededShan {
  private readonly _pai: string[];
  private readonly _baopai: string[];
  private readonly _fubaopai: string[] | null;
  private _weikaigang = false;
  private _closed = false;

  constructor(
    private readonly rule: Record<string, unknown>,
    private readonly tileSet: TileSetDefinition,
    random: RandomSource,
  ) {
    const tiles = expandTileSet(tileSet);
    for (let index = tiles.length - 1; index > 0; index -= 1) {
      const swap = random.int(index + 1);
      [tiles[index], tiles[swap]] = [tiles[swap], tiles[index]];
    }
    this._pai = tiles;
    this._baopai = [this._pai[4]];
    this._fubaopai = rule['裏ドラあり'] ? [this._pai[9]] : null;
  }

  static zhenbaopai(tile: string): string {
    return (Majiang.Shan as any).zhenbaopai(tile);
  }

  zimo(): string {
    if (this._closed || this.paishu === 0 || this._weikaigang) throw new Error('Wall cannot draw.');
    return this._pai.pop() as string;
  }

  gangzimo(): string {
    if (this._closed || this.paishu === 0 || this._weikaigang) throw new Error('Wall cannot draw from dead wall.');
    if (this._baopai.length >= this.tileSet.maximumDoraIndicators) throw new Error('Maximum dora indicators reached.');
    this._weikaigang = Boolean(this.rule['カンドラあり']);
    if (!this._weikaigang) this._baopai.push('');
    return this._pai.shift() as string;
  }

  kaigang(): this {
    if (this._closed || !this._weikaigang) throw new Error('No pending kan dora reveal.');
    this._baopai.push(this._pai[4]);
    if (this._fubaopai && this.rule['カン裏あり']) this._fubaopai.push(this._pai[9]);
    this._weikaigang = false;
    return this;
  }

  close(): this {
    this._closed = true;
    return this;
  }

  get paishu(): number {
    return this._pai.length - this.tileSet.deadWallSize;
  }

  get baopai(): string[] {
    return this._baopai.filter(Boolean);
  }

  get fubaopai(): string[] | null {
    if (!this._closed) return null;
    return this._fubaopai ? [...this._fubaopai] : null;
  }
}
