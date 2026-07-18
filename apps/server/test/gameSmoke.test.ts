import { describe, expect, it } from 'vitest';
import Majiang from '@kobalab/majiang-core';
import AIPlayer from '@kobalab/majiang-ai';

describe('majiang-core integration', () => {
  it('finishes a complete AI east-only match synchronously', () => {
    let paipu: any;
    const game = new Majiang.Game([0, 1, 2, 3].map(() => new AIPlayer()), (value: any) => { paipu = value; }, Majiang.rule({ '場数': 1, '延長戦方式': 0 }));
    game.do_sync();
    expect(paipu.log.length).toBeGreaterThan(0);
    expect(paipu.defen).toHaveLength(4);
  }, 30000);
});
