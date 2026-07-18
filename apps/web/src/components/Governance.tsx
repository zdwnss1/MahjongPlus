import { useState } from 'react';
import type { RoomState } from '@mahjongplus/shared';

export function Governance({ room, meId, act }: { room: RoomState; meId: string; act: (event: string, payload?: unknown) => Promise<void>; }) {
  const [text, setText] = useState('');
  const governance = room.governance!;
  const proposer = room.players.find((player) => player.id === governance.proposerId);
  const proposal = governance.proposal;
  const myVote = proposal?.votes[meId];
  return <section className="panel stage">
    <h2>规则制定</h2><p>当前：{governance.proposerSeat?.toUpperCase()} 家 {proposer?.name} · 规则位 {governance.slot}/{governance.totalSlots}</p>
    {!proposal && governance.proposerId === meId && <><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="用自然语言提出规则。当前版本会完成权限检查、投票和冻结；可执行模块接口已保留。" /><div className="actions"><button onClick={() => act('governance:submit', { text }).then(() => setText(''))}>提交规则</button><button className="secondary" onClick={() => act('governance:skip', { all: false })}>跳过本位</button><button className="danger" onClick={() => act('governance:skip', { all: true })}>跳过全部剩余</button></div></>}
    {!proposal && governance.proposerId !== meId && <p className="waiting">等待 {proposer?.name} 提案或跳过。</p>}
    {proposal && <article className="proposal"><h3>提案</h3><p>{proposal.text}</p><div className="votes">{Object.entries(proposal.votes).map(([id, vote]) => <span key={id}>{room.players.find((player) => player.id === id)?.name}: {vote ?? '未投票'}</span>)}</div>{proposal.stage === 'voting' && proposal.authorId !== meId && <div className="actions"><button disabled={Boolean(myVote)} onClick={() => act('governance:vote', { vote: 'approve' })}>赞成 / 不驳回</button><button className="danger" disabled={Boolean(myVote)} onClick={() => act('governance:vote', { vote: 'reject' })}>反对</button></div>}{proposal.stage === 'author-confirmation' && proposal.authorId === meId && <><pre>{proposal.candidate?.canonicalText}</pre><button onClick={() => act('governance:confirm-rule')}>确认并发布</button></>}</article>}
    {room.acceptedRules.length > 0 && <div><h3>已发布规则 artifacts</h3>{room.acceptedRules.map((rule) => <p key={rule.id} className="rule-line">#{rule.slot} {rule.originalText} <em>{rule.executable ? '执行' : '当前不执行'}</em></p>)}</div>}
  </section>;
}
