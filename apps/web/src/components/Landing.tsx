import { useState } from 'react';
import type { SessionIdentity } from '@mahjongplus/shared';
import { emit } from '../socket';

export function Landing({ onSession }: { onSession: (session: SessionIdentity) => void }) {
  const [name, setName] = useState('Player');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const run = async (operation: () => Promise<SessionIdentity>) => {
    setError('');
    try { onSession(await operation()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
  };
  return <main className="landing">
    <section className="hero"><p className="eyebrow">CONSTITUTIONAL RIICHI MAHJONG</p><h1>MahjongPlus</h1><p>现实牌桌是最低能力下限：任何动作都能尝试，服务器负责裁定、执行或处罚；线上规则还能创造现实牌桌做不到的牌、随机性和状态。</p></section>
    <section className="panel join-panel">
      <label>昵称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button onClick={() => run(() => emit('room:create', { name }))}>创建公开房间</button>
      <div className="divider">或</div>
      <label>房间码<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /></label>
      <button className="secondary" onClick={() => run(() => emit('room:join', { code: joinCode, name }))}>加入房间</button>
      {error && <p className="error">{error}</p>}
    </section>
  </main>;
}
