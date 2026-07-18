import type { ActionCatalogEntry } from '@mahjongplus/shared';

export const ACTION_CATALOG: ActionCatalogEntry[] = [
  { kind: 'draw', label: '摸牌', description: '尝试从普通牌山或岭上牌区摸牌。任何时刻均可尝试。', parameterMode: 'none' },
  { kind: 'discard', label: '打牌', description: '尝试打出自己持有的某个物理牌实例。', parameterMode: 'tile' },
  { kind: 'riichi', label: '立直', description: '尝试宣告立直并打出指定牌。', parameterMode: 'tile' },
  { kind: 'tsumo', label: '自摸', description: '尝试宣布自摸和。错误宣布可触发诈和处罚。', parameterMode: 'none' },
  { kind: 'ron', label: '荣和', description: '尝试对最近的可响应事件宣布荣和。', parameterMode: 'none' },
  { kind: 'chi', label: '吃', description: '尝试使用最近弃牌组成顺子。', parameterMode: 'meld' },
  { kind: 'pon', label: '碰', description: '尝试使用最近弃牌组成刻子。', parameterMode: 'meld' },
  { kind: 'open-kan', label: '大明杠', description: '尝试使用最近弃牌组成明杠。', parameterMode: 'meld' },
  { kind: 'closed-kan', label: '暗杠', description: '尝试从手牌组成暗杠。', parameterMode: 'meld' },
  { kind: 'added-kan', label: '加杠', description: '尝试把已有碰升级为杠。', parameterMode: 'meld' },
  { kind: 'abortive-draw', label: '流局宣言', description: '尝试宣告九种九牌或未来注册的特殊流局。', parameterMode: 'custom' },
  { kind: 'reveal-hand', label: '公开手牌', description: '像现实中摊牌一样立即公开自己的手牌。', parameterMode: 'none' },
  { kind: 'pass', label: '跳过', description: '放弃当前响应机会；没有机会时是无害的声明。', parameterMode: 'none' },
  { kind: 'custom', label: '自定义动作', description: '由可执行规则模块注册的动作类型。', parameterMode: 'custom' },
];
