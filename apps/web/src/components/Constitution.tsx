import { useEffect, useState } from 'react';
import type { MatchConstitution, RoomState } from '@mahjongplus/shared';

export function Constitution({ room, isHost, meId, act }: { room: RoomState; isHost: boolean; meId: string; act: (event: string, payload?: unknown) => Promise<void>; }) {
  const [draft, setDraft] = useState<MatchConstitution>(room.constitution);
  useEffect(() => setDraft(room.constitution), [room.constitution]);
  const confirmed = room.constitutionConfirmedBy.includes(meId);
  const penalty = draft.penaltyPolicy;
  return <section className="panel stage">
    <h2>赛前宪法</h2><p>元参数与默认裁判制度先冻结，任何玩家规则和未来 LLM 插件都不能偷偷修改。</p>
    <div className="form-grid">
      <label>基础规则<select disabled={!isHost} value={draft.baseProfile} onChange={(event) => setDraft({ ...draft, baseProfile: event.target.value as MatchConstitution['baseProfile'] })}><option value="tenhou">天凤系</option><option value="mleague">M.LEAGUE系</option></select></label>
      <label>局长<select disabled={!isHost} value={draft.matchLength} onChange={(event) => setDraft({ ...draft, matchLength: event.target.value as MatchConstitution['matchLength'] })}><option value="east">东风战</option><option value="hanchan">半庄</option></select></label>
      <label>初始点数<input disabled={!isHost} type="number" value={draft.initialScore} onChange={(event) => setDraft({ ...draft, initialScore: Number(event.target.value) })} /></label>
      <label>击飞<select disabled={!isHost} value={draft.bankruptcy ? 'yes' : 'no'} onChange={(event) => setDraft({ ...draft, bankruptcy: event.target.value === 'yes' })}><option value="yes">开启</option><option value="no">关闭</option></select></label>
      <label>每人规则位<input disabled={!isHost} type="number" min="0" max="5" value={draft.ruleSlotsPerPlayer} onChange={(event) => setDraft({ ...draft, ruleSlotsPerPlayer: Number(event.target.value) })} /></label>
      <label>动作时限（秒）<input disabled={!isHost} type="number" min="10" max="180" value={draft.actionTimeoutSeconds} onChange={(event) => setDraft({ ...draft, actionTimeoutSeconds: Number(event.target.value) })} /></label>
      <label>非法动作<select disabled={!isHost} value={penalty.illegalActionPolicy} onChange={(event) => setDraft({ ...draft, penaltyPolicy: { ...penalty, illegalActionPolicy: event.target.value as MatchConstitution['penaltyPolicy']['illegalActionPolicy'] } })}><option value="reject-only">仅拒绝</option><option value="fixed-penalty">拒绝并罚点</option></select></label>
      <label>时机错误罚点<input disabled={!isHost} type="number" min="0" value={penalty.mistimedActionPenalty} onChange={(event) => setDraft({ ...draft, penaltyPolicy: { ...penalty, mistimedActionPenalty: Number(event.target.value) } })} /></label>
      <label>错误和牌罚点<input disabled={!isHost} type="number" min="0" value={penalty.falseWinPenalty} onChange={(event) => setDraft({ ...draft, penaltyPolicy: { ...penalty, falseWinPenalty: Number(event.target.value) } })} /></label>
      <label>罚点去向<select disabled={!isHost} value={penalty.distribution} onChange={(event) => setDraft({ ...draft, penaltyPolicy: { ...penalty, distribution: event.target.value as MatchConstitution['penaltyPolicy']['distribution'] } })}><option value="burn">销毁</option><option value="split-opponents">分给其余三家</option></select></label>
      <label>重复犯规警戒线<input disabled={!isHost} type="number" min="1" value={penalty.repeatedViolationLimit} onChange={(event) => setDraft({ ...draft, penaltyPolicy: { ...penalty, repeatedViolationLimit: Number(event.target.value) } })} /></label>
    </div>
    <div className="actions">{isHost && <button onClick={() => act('constitution:update', draft)}>保存宪法草案</button>}<button className="secondary" disabled={confirmed} onClick={() => act('constitution:confirm')}>{confirmed ? '已确认' : '确认宪法'}</button>{isHost && <button disabled={room.constitutionConfirmedBy.length !== 4} onClick={() => act('constitution:lock')}>冻结并进入规则阶段</button>}</div>
  </section>;
}
