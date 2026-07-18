import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import type { Ack, MatchConstitution, RoomState, SessionIdentity } from '@mahjongplus/shared';
import './styles.css';

const socket = io();
const STORAGE_KEY = 'mahjongplus-session';

function emit<T>(event: string, payload: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (ack: Ack<T>) => ack.ok ? resolve(ack.data as T) : reject(new Error(ack.error ?? '操作失败')));
  });
}

function Tile({ value }: { value: string }) {
  return <span className={`tile tile-${value[0]}`}>{value}</span>;
}

function App() {
  const [session, setSession] = useState<SessionIdentity | null>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { return null; }
  });
  const [room, setRoom] = useState<RoomState | null>(null);
  const [name, setName] = useState('Player');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const me = room?.players.find((player) => player.id === session?.playerId);
  const isHost = room?.hostId === session?.playerId;

  useEffect(() => {
    const stateHandler = (state: RoomState) => setRoom(state);
    socket.on('room:state', stateHandler);
    if (session) emit('room:attach', session).catch((reason) => setError(reason.message));
    return () => { socket.off('room:state', stateHandler); };
  }, [session]);

  const saveSession = (value: SessionIdentity) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    setSession(value);
  };
  const act = async (event: string, payload: unknown = {}) => {
    setError('');
    try { await emit(event, payload); } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
  };

  if (!session || !room) return <main className="landing">
    <section className="hero">
      <p className="eyebrow">CONSTITUTIONAL RIICHI MAHJONG</p>
      <h1>MahjongPlus</h1>
      <p>先冻结宪法，再按东南西北制定村规，最后由确定性服务器完成整场立直麻将。</p>
    </section>
    <section className="panel join-panel">
      <label>昵称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button onClick={async () => saveSession(await emit('room:create', { name }))}>创建公开房间</button>
      <div className="divider">或</div>
      <label>房间码<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /></label>
      <button className="secondary" onClick={async () => saveSession(await emit('room:join', { code: joinCode, name }))}>加入房间</button>
      {error && <p className="error">{error}</p>}
    </section>
  </main>;

  return <main className="app-shell">
    <header><div><p className="eyebrow">ROOM {room.code}</p><h1>MahjongPlus</h1></div><span className={`phase phase-${room.phase}`}>{room.phase}</span></header>
    {room.notice && <div className="notice">{room.notice}</div>}
    {error && <div className="error banner">{error}</div>}
    <section className="player-strip">
      {room.players.map((player) => <article key={player.id} className={player.id === session.playerId ? 'player-card me' : 'player-card'}>
        <strong>{player.startingSeat ? player.startingSeat.toUpperCase() : '—'} · {player.name}</strong>
        <span>{player.isBot ? 'BOT' : player.connected ? 'ONLINE' : 'OFFLINE'}</span>
      </article>)}
    </section>

    {room.phase === 'lobby' && <section className="panel stage">
      <h2>大厅</h2><p>四人到齐后随机座位。房主也可以用机器人补齐。</p>
      {isHost && <div className="actions"><button onClick={() => act('lobby:add-bots')}>机器人补齐</button><button onClick={() => act('lobby:begin-constitution')}>随机座位并立宪</button></div>}
    </section>}

    {room.phase === 'constitution' && <Constitution room={room} isHost={isHost} meId={session.playerId} act={act} />}
    {room.phase === 'governance' && <Governance room={room} meId={session.playerId} act={act} />}
    {(room.phase === 'playing' || room.phase === 'finished') && <Table room={room} meId={session.playerId} isHost={isHost} act={act} />}

    <footer>基础规则：{room.constitution.baseProfile === 'tenhou' ? '天凤系' : 'M.LEAGUE系'} · {room.constitution.matchLength === 'east' ? '东风战' : '半庄'} · {me?.name}</footer>
  </main>;
}

function Constitution({ room, isHost, meId, act }: { room: RoomState; isHost: boolean; meId: string; act: (event: string, payload?: unknown) => Promise<void> }) {
  const [draft, setDraft] = useState<MatchConstitution>(room.constitution);
  useEffect(() => setDraft(room.constitution), [room.constitution]);
  const confirmed = room.constitutionConfirmedBy.includes(meId);
  return <section className="panel stage">
    <h2>赛前宪法</h2><p>这些元参数先冻结，任何玩家规则与未���的 LLM 插件都不能修改。</p>
    <div className="form-grid">
      <label>基础规则<select disabled={!isHost} value={draft.baseProfile} onChange={(event) => setDraft({ ...draft, baseProfile: event.target.value as MatchConstitution['baseProfile'] })}><option value="tenhou">天凤系</option><option value="mleague">M.LEAGUE系</option></select></label>
      <label>局长<select disabled={!isHost} value={draft.matchLength} onChange={(event) => setDraft({ ...draft, matchLength: event.target.value as MatchConstitution['matchLength'] })}><option value="east">东风战</option><option value="hanchan">半庄</option></select></label>
      <label>初始点数<input disabled={!isHost} type="number" value={draft.initialScore} onChange={(event) => setDraft({ ...draft, initialScore: Number(event.target.value) })} /></label>
      <label>击飞<select disabled={!isHost} value={draft.bankruptcy ? 'yes' : 'no'} onChange={(event) => setDraft({ ...draft, bankruptcy: event.target.value === 'yes' })}><option value="yes">开启</option><option value="no">关闭</option></select></label>
      <label>每人规则位<input disabled={!isHost} type="number" min="0" max="5" value={draft.ruleSlotsPerPlayer} onChange={(event) => setDraft({ ...draft, ruleSlotsPerPlayer: Number(event.target.value) })} /></label>
      <label>动作时限（秒）<input disabled={!isHost} type="number" min="10" max="180" value={draft.actionTimeoutSeconds} onChange={(event) => setDraft({ ...draft, actionTimeoutSeconds: Number(event.target.value) })} /></label>
    </div>
    <div className="actions">{isHost && <button onClick={() => act('constitution:update', draft)}>保存宪法草案</button>}<button className="secondary" disabled={confirmed} onClick={() => act('constitution:confirm')}>{confirmed ? '已确认' : '确认宪法'}</button>{isHost && <button disabled={room.constitutionConfirmedBy.length !== 4} onClick={() => act('constitution:lock')}>冻结并进入规则阶段</button>}</div>
  </section>;
}

function Governance({ room, meId, act }: { room: RoomState; meId: string; act: (event: string, payload?: unknown) => Promise<void> }) {
  const [text, setText] = useState('');
  const g = room.governance!;
  const proposer = room.players.find((player) => player.id === g.proposerId);
  const proposal = g.proposal;
  const myVote = proposal?.votes[meId];
  return <section className="panel stage">
    <h2>规则制定</h2><p>当前：{g.proposerSeat?.toUpperCase()} 家 {proposer?.name} · 规则位 {g.slot}/{g.totalSlots}</p>
    {!proposal && g.proposerId === meId && <><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="用自然语言提出规则。MVP 会完成权限检查、投票和冻结，但暂不执行该规则。" /><div className="actions"><button onClick={() => act('governance:submit', { text }).then(() => setText(''))}>提交规则</button><button className="secondary" onClick={() => act('governance:skip', { all: false })}>跳过本位</button><button className="danger" onClick={() => act('governance:skip', { all: true })}>跳过全部剩余</button></div></>}
    {!proposal && g.proposerId !== meId && <p className="waiting">等待 {proposer?.name} 提案或跳过。</p>}
    {proposal && <article className="proposal"><h3>提案</h3><p>{proposal.text}</p><div className="votes">{Object.entries(proposal.votes).map(([id, vote]) => <span key={id}>{room.players.find((p) => p.id === id)?.name}: {vote ?? '未投票'}</span>)}</div>
      {proposal.stage === 'voting' && proposal.authorId !== meId && <div className="actions"><button disabled={Boolean(myVote)} onClick={() => act('governance:vote', { vote: 'approve' })}>赞成 / 不驳回</button><button className="danger" disabled={Boolean(myVote)} onClick={() => act('governance:vote', { vote: 'reject' })}>反对</button></div>}
      {proposal.stage === 'author-confirmation' && proposal.authorId === meId && <><pre>{proposal.candidate?.canonicalText}</pre><button onClick={() => act('governance:confirm-rule')}>确认并发布</button></>}
    </article>}
    {room.acceptedRules.length > 0 && <div><h3>已发布规则 artifacts</h3>{room.acceptedRules.map((rule) => <p key={rule.id} className="rule-line">#{rule.slot} {rule.originalText} <em>{rule.executable ? '执行' : 'MVP不执行'}</em></p>)}</div>}
  </section>;
}

function Table({ room, meId, isHost, act }: { room: RoomState; meId: string; isHost: boolean; act: (event: string, payload?: unknown) => Promise<void> }) {
  const game = room.game;
  if (!game) return <section className="panel stage"><h2>牌局启动中</h2></section>;
  const request = game.actionRequest;
  const sorted = useMemo(() => [...game.players].sort((a, b) => ['north', 'west', 'east', 'south'].indexOf(a.currentSeat) - ['north', 'west', 'east', 'south'].indexOf(b.currentSeat)), [game.players]);
  return <section className="table-stage">
    <div className="table-center"><strong>{game.round}</strong><span>{game.honba} 本场 · 供托 {game.riichiSticks}</span><span>牌山 {game.remainingTiles}</span><div>宝牌 {game.doraIndicators.map((tile) => <Tile key={tile} value={tile} />)}</div><small>{game.lastEvent}</small></div>
    <div className="boards">{sorted.map((player) => <article key={player.playerId} className={`board board-${player.currentSeat} ${player.playerId === meId ? 'my-board' : ''}`}><header><strong>{player.currentSeat.toUpperCase()} · {player.name}</strong><span>{player.score.toLocaleString()} 点</span></header><div className="concealed">{player.hand ? player.hand.map((tile, index) => <Tile key={`${tile}-${index}`} value={tile} />) : Array.from({ length: player.handCount }, (_, index) => <span key={index} className="tile back">◆</span>)}</div><div className="melds">{player.melds.join(' · ') || '门清'}</div><div className="river">{player.river.map((tile, index) => <Tile key={`${tile}-${index}`} value={tile.slice(0, 2)} />)}</div></article>)}</div>
    {request && <aside className="action-dock"><h3>{request.prompt}</h3><div className="actions wrap">{request.options.map((option) => <button key={option.id} className={option.kind === 'pass' ? 'secondary' : option.kind === 'ron' || option.kind === 'tsumo' ? 'win' : ''} onClick={() => act('game:action', { requestId: request.id, optionId: option.id })}>{option.label}</button>)}</div></aside>}
    {game.result && <aside className="result"><h2>本场结束</h2>{game.result.ranks.map((id, index) => <p key={id}>{index + 1}. {room.players.find((player) => player.id === id)?.name} — {game.result!.scores[id].toLocaleString()}</p>)}{isHost && <button onClick={() => act('match:next')}>下一场：原南家先立法</button>}</aside>}
  </section>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
