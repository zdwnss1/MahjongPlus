import Majiang from '@kobalab/majiang-core';
import type { RandomSource } from '../kernel/random.js';
import { SeededShan } from '../kernel/seededShan.js';
import type { TileSetDefinition } from '../kernel/tileSet.js';

export class RuleAwareMajiangGame extends (Majiang.Game as any) {
  private handSequence = 0;
  constructor(players: any[], callback: (paipu: any) => void, rule: Record<string, unknown>, title: string, private readonly wallRandom: RandomSource, private readonly tileSet: TileSetDefinition) {
    super(players, callback, rule, title);
  }
  qipai(shan?: unknown) {
    const wall = shan ?? new SeededShan(this._rule, this.tileSet, this.wallRandom.fork(`hand:${this.handSequence++}`));
    return super.qipai(wall);
  }
}
