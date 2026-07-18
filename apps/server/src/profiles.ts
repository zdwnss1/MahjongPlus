import Majiang from '@kobalab/majiang-core';
import type { MatchConstitution } from '@mahjongplus/shared';

export interface BaseRuleProfile {
  id: 'tenhou' | 'mleague';
  label: string;
  version: string;
  description: string;
  build(constitution: MatchConstitution): Record<string, unknown>;
}

const common = (c: MatchConstitution) => ({
  '配給原点': c.initialScore,
  '場数': c.matchLength === 'east' ? 1 : 2,
  'トビ終了あり': c.bankruptcy,
});

export const PROFILES: Record<BaseRuleProfile['id'], BaseRuleProfile> = {
  tenhou: {
    id: 'tenhou',
    label: '天鳳四人段位战系',
    version: '2026-07-snapshot',
    description: '喰断、赤3、途中流局、流し満貫、ダブロン、飞び与延长可由宪法覆盖。',
    build(c) {
      return Majiang.rule({
        ...common(c),
        '赤牌': { m: 1, p: 1, s: 1 },
        'クイタンあり': true,
        '喰い替え許可レベル': 0,
        '途中流局あり': true,
        '流し満貫あり': true,
        'ノーテン宣言あり': false,
        'ノーテン罰あり': true,
        '最大同時和了数': 2,
        '連荘方式': 2,
        'オーラス止めあり': true,
        '延長戦方式': 1,
        '一発あり': true,
        '裏ドラあり': true,
        'カンドラあり': true,
        'カン裏あり': true,
        'カンドラ後乗せ': true,
        'ツモ番なしリーチあり': false,
        'リーチ後暗槓許可レベル': 2,
        '役満の複合あり': true,
        'ダブル役満あり': true,
        '数え役満あり': true,
        '役満パオあり': true,
        '切り上げ満貫あり': false,
      });
    },
  },
  mleague: {
    id: 'mleague',
    label: 'M.LEAGUE 公式战糹',
    version: '2026-07-snapshot',
    description: '赤3、头跳、无飞、无途中流局、无流局满贯、无终局止め。宪法可覆盖局长、初始点数与击飞。',
    build(c) {
      return Majiang.rule({
        ...common(c),
        '順位点': ['+30.0', '+10.0', '-10.0', '-30.0'],
        '赤牌': { m: 1, p: 1, s: 1 },
        '連風牌は2符': true,
        'クイタンあり': true,
        '喰い替え許可レベル': 0,
        '途中流局あり': false,
        '流し満貫あり': false,
        'ノーテン宣言あり': true,
        'ノーテン罰あり': true,
        '最大同時和了数': 1,
        '連荘方式': 2,
        'オーラス止めあり': false,
        '延長戦方式': 0,
        '一発あり': true,
        '裏ドラあり': true,
        'カンドラあり': true,
        'カン裏あり': true,
        'カンドラ後乗せ': false,
        'ツモ番なしリーチあり': true,
        'リーチ後暗槓許可レベル': 1,
        'ダブル役満あり': false,
        '役満の複合あり': true,
        '数え役満あり': false,
        '役満パオあり': true,
        '切り上げ満貫あり': true,
      });
    },
  },
};
