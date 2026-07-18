import { nanoid } from 'nanoid';
import type { MatchConstitution, RuleArtifact } from '@mahjongplus/shared';

export interface RuleCompilationContext {
  constitution: MatchConstitution;
  acceptedRules: RuleArtifact[];
  authorId: string;
  slot: number;
}

export type RuleCompilationResult =
  | { ok: true; artifact: RuleArtifact }
  | { ok: false; reason: string };

export interface RuleCompilerPort {
  compile(text: string, context: RuleCompilationContext): Promise<RuleCompilationResult>;
}

const META_MUTATION = /(改成|修改|关闭|开启|增加|减少|重设).{0,8}(东风|東風|半庄|半荘|起始点|初始点|击飞|飛び|规则位|规则数量|座位|天凤|天鳳|M\.?LEAGUE)/i;

/**
 * Safe MVP compiler. It enforces the immutable constitution boundary and records
 * accepted natural-language proposals as explicit non-executable artifacts.
 */
export class RecordingRuleCompiler implements RuleCompilerPort {
  async compile(text: string, context: RuleCompilationContext): Promise<RuleCompilationResult> {
    const normalized = text.trim();
    if (normalized.length < 2) return { ok: false, reason: '规则文本过短。' };
    if (normalized.length > 1000) return { ok: false, reason: '规则文本超过 1000 字。' };
    if (META_MUTATION.test(normalized)) {
      return { ok: false, reason: '该提案试图修改赛前宪法；玩家规则没有这一权限。' };
    }

    return {
      ok: true,
      artifact: {
        id: nanoid(12),
        authorId: context.authorId,
        slot: context.slot,
        originalText: normalized,
        canonicalText: `记录规则：${normalized}\n\nMVP 状态：规则已完成治理与冻结，但尚未编译为可执行 MRIR，因此本场仅执行所选基础规则包。`,
        status: 'compiled-noop',
        executable: false,
        compiler: 'recording-compiler/0.1',
        createdAt: new Date().toISOString(),
      },
    };
  }
}
