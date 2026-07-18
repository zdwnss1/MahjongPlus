import { useEffect, useState } from 'react';
import type { RoomState, SessionIdentity } from '@mahjongplus/shared';
import { Constitution } from './components/Constitution';
import { Governance } from './components/Governance';
import { Landing } from './components/Landing';
import { Table } from './components/Table';
import { emit, socket } from './socket';

const STORAGE_KEY = 'mahjongplus-session';

export function App() {
  const [session, setSession] = useState<SessionIdentity | null>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); }
    catch { return null; }
  });
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState('');

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
    try { await emit(event, payload); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
  };

  if (!session || !room) return <Landing onSession={saveSession} />;

  const me = room.players.find((player) => player.id === session.playerId);
  const isHost = room.hostId === session.playerId;
  return <main className="app-shell">
    <header><div><p className="eyebrow">ROOM {room.code}</p><h1>MahjongPlus</h1></div><span className={`phase phase-${room.phase}`}>{room.phase}</span></header>
    {room.notice && <div className="notice">{room.notice}</div>}
    {error && <div className="error banner">{error}</div>}
    <section className="player-strip">{room.players.map((player) => <article key={player.id} className={player.id === session.playerId ? 'player-card me' : 'player-card'}>
      <strong>{player.startingSeat ? player.startingSeat.toUpperCase() : '—'} · {player.name}</strong>
      <span>{player.isBot ? 'BOT' : player.connected ? 'ONLINE' : 'OFFLINE'}</span>
    </article>)}</section>

    {room.phase === 'lobby' && <section className="panel stage"><h2>大厅</h2><p>四人到齐后随机座位。房主也可以用机器人补齐。</p>{isHost && <div className="actions"><button onClick={() => act('lobby:add-bots')}>机器人补齐</button><button onClick={() => act('lobby:begin-constitution')}>随机座位并立宪</button></div>}</section>}
    {room.phase === 'constitution' && <Constitution room={room} isHost={isHost} meId={session.playerId} act={act} />}
    {room.phase === 'governance' && <Governance room={room} meId={session.playerId} act={act} />}
    {(room.phase === 'playing' || room.phase === 'finished') && <Table room={room} meId={session.playerId} isHost={isHost} act={act} />}

    <footer>基础规则：{room.constitution.baseProfile === 'tenhou' ? '天凤系' : 'M.LEAGUE系'} · {room.constitution.matchLength === 'east' ? '东风战' : '半庄'} · {me?.name}</footer>
  </main>;
}
