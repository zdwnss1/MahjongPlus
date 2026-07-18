import { useMemo, useState } from 'react';
import type { ActionIntent, ActionReceipt, RoomState } from '@mahjongplus/shared';
import { emit } from '../socket';
import { ReceiptCard } from './ReceiptCard';
import { Tile } from './Tile';

interface TableProps {
  room: RoomState;
  meId: string;
  isHost: boolean;
  act: (event: string, payload?: unknown) => Promise<void>;
}

export function Table({ room, meId, isHost, act }: TableProps) {
  const game = room.game;
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  if (!game) return <section className="panel stage"><h2>牌局启动中</h2></section>;

  const request = game.actionRequest;
  const sorted = useMemo(
    () => [...game.players].sort((left, right) => ['north', 'west', 'east', 'south'].indexOf(left.currentSeat) - ['north', 'west', 'east', 'south'].indexOf(right.currentSeat)),
    [game.players],
  );
  const myBoard = game.players.find((player) => player.playerId === meId);

  const attempt = async (action: ActionIntent) => {
    const value = await emit<ActionReceipt>('game:attempt', {
      attemptId: crypto.randomUUID(),
      observedRevision: game.revision,
      action,
    });
    setReceipt(value);
  };

  return <>
    <section className="table-stage">
      <div className="table-center">
        <strong>{game.round}</strong>
        <span>{game.honba} 本场 · 供托 {game.riichiSticks}</span>
        <span>牌山 {game.remainingTiles}</span>
        <div>宝牌 {game.doraIndicators.map((tile) => <Tile key={tile.id} value={tile} />)}</div>
        <small>{game.lastEvent}</small><small>revision {game.revision}</small>
      </div>
      <div className="boards">{sorted.map((player) => <article key={player.playerId} className={`board board-${player.currentSeat} ${player.playerId === meId ? 'my-board' : ''}`}>
        <header><strong>{player.currentSeat.toUpperCase()} · {player.name}</strong><span>{player.score.toLocaleString()} 点</span></header>
        <div className="status-row"><span>犯规 {player.violationCount}</span>{player.handRevealed && <span>已公开</span>}</div>
        <div className="concealed">{player.hand
          ? player.hand.map((tile) => <Tile key={tile.id} value={tile} />)
          : Array.from({ length: player.handCount }, (_, index) => <span key={index} className="tile back">◆</span>)}</div>
        <div className="melds">{player.melds.join(' · ') || '门清'}</div>
        <div className="river">{player.river.map((tile) => <Tile key={tile.id} value={tile} />)}</div>
      </article>)}</div>
    </section>

    <section className="panel action-console">
      <h2>动作控制台</h2>
      <p>常规机会只是提示，不是权限白名单。下面的现实动作始终可以尝试；服务器会用冻结规则包裁定并原子结算后果。</p>
      {request && <div className="suggested-actions"><h3>{request.prompt}</h3><div className="actions wrap">{request.options.map((option) => <button key={option.id} className={option.kind === 'pass' ? 'secondary' : option.kind === 'ron' || option.kind === 'tsumo' ? 'win' : ''} onClick={() => attempt(option.intent)}>{option.label}</button>)}</div></div>}
      <h3>现实动作全集</h3>
      <div className="actions wrap universal-actions">
        <button className="danger" onClick={() => attempt({ type: 'draw', source: 'wall' })}>摸牌</button>
        <button className="danger" onClick={() => attempt({ type: 'win', mode: 'tsumo' })}>宣布自摸</button>
        <button className="danger" onClick={() => attempt({ type: 'win', mode: 'ron' })}>宣布荣和</button>
        <button className="danger" onClick={() => attempt({ type: 'call', kind: 'chi' })}>吃</button>
        <button className="danger" onClick={() => attempt({ type: 'call', kind: 'pon' })}>碰</button>
        <button className="danger" onClick={() => attempt({ type: 'call', kind: 'open-kan' })}>大明杠</button>
        <button className="danger" onClick={() => attempt({ type: 'kan', kind: 'closed-kan' })}>暗杠</button>
        <button className="danger" onClick={() => attempt({ type: 'kan', kind: 'added-kan' })}>加杠</button>
        <button className="danger" onClick={() => attempt({ type: 'abortive-draw' })}>宣告流局</button>
        <button onClick={() => attempt({ type: 'reveal-hand' })}>公开手牌</button>
        <button className="secondary" onClick={() => attempt({ type: 'pass' })}>说“过”</button>
      </div>
      {myBoard?.hand && <><h3>任意打牌 / 立直尝试</h3><div className="physical-hand">{myBoard.hand.map((tile) => <div className="tile-action" key={tile.id}>
        <Tile value={tile} />
        <button onClick={() => attempt({ type: 'discard', tileId: tile.id })}>打</button>
        <button className="danger" onClick={() => attempt({ type: 'riichi', tileId: tile.id })}>立</button>
      </div>)}</div></>}
      {receipt && <ReceiptCard receipt={receipt} />}
      {game.recentReceipts.length > 0 && <details><summary>最近动作收据</summary>{game.recentReceipts.slice(0, 6).map((entry) => <ReceiptCard key={entry.attemptId} receipt={entry} compact />)}</details>}
    </section>

    {game.result && <aside className="result"><h2>本场结束</h2>{game.result.ranks.map((id, index) => <p key={id}>{index + 1}. {room.players.find((player) => player.id === id)?.name} — {game.result!.scores[id].toLocaleString()}</p>)}{isHost && <button onClick={() => act('match:next')}>下一场：原南家先立法</button>}</aside>}
  </>;
}
