import type { RuleModuleDefinition } from '@mahjongplus/world-language';
import { LOCAL_YAKU_MODULES } from './localYaku.js';
import { SUPER_RIICHI_MODULE } from './superRiichiModule.js';

export const RIICHI_RULE_MODULES: RuleModuleDefinition[] = [
  ...LOCAL_YAKU_MODULES,
  SUPER_RIICHI_MODULE,
];
