import {
  analyzeRuleModuleDefinition,
  type RuleModuleDefinition,
} from '@mahjongplus/world-language';
import { LOCAL_YAKU_MODULES } from './localYaku.js';
import { RIICHI_COMMON_FLOW_MODULE } from './riichiCommonFlowModule.js';
import { SUPER_RIICHI_MODULE } from './superRiichiModule.js';
import { TURBO_RIICHI_MODULES } from './turboRiichiModules.js';

export const RIICHI_RULE_MODULES: RuleModuleDefinition[] = [
  RIICHI_COMMON_FLOW_MODULE,
  ...LOCAL_YAKU_MODULES,
  SUPER_RIICHI_MODULE,
  ...TURBO_RIICHI_MODULES,
];

export const RIICHI_RULE_MODULE_ANALYSES = RIICHI_RULE_MODULES.map((definition) =>
  analyzeRuleModuleDefinition(definition));
