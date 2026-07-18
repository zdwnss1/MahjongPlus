import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { Ack, ActionAttempt, ActionReceipt, MatchConstitution, RuleVote, SessionIdentity } from '@mahjongplus/shared';
import { RoomStore, safeAck } from './room.js';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
const rooms = new RoomStore(io);

app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'mahjongplus', version: '0.1.0' }));

io.on('connection', (socket) => {
  const identity = () => {
    const roomCode = socket.data.roomCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!roomCode || !playerId) throw new Error('请先连接房间身份。');
    return { room: rooms.get(roomCode), playerId };
  };

  socket.on('room:create', (payload: { name: string }, ack?: (value: Ack<SessionIdentity>) => void) => {
    safeAck(ack, () => rooms.create(payload.name).identity);
  });
  socket.on('room:join', (payload: { code: string; name: string }, ack?: (value: Ack<SessionIdentity>) => void) => {
    safeAck(ack, () => rooms.join(payload.code, payload.name).identity);
  });
  socket.on('room:attach', (payload: SessionIdentity, ack?: (value: Ack) => void) => {
    safeAck(ack, () => {
      rooms.get(payload.roomCode).attach(socket, payload.playerId, payload.token);
      return undefined;
    });
  });
  socket.on('lobby:add-bots', (_payload: unknown, ack?: (value: Ack) => void) => safeAck(ack, () => {
    const { room, playerId } = identity(); room.addBots(playerId); return undefined;
  }));
  socket.on('lobby:begin-constitution', (_payload: unknown, ack?: (value: Ack) => void) => safeAck(ack, () => {
    const { room, playerId } = identity(); room.beginConstitution(playerId); return undefined;
  }));
  socket.on('constitution:update', (payload: MatchConstitution, ack?: (value: Ack) => void) => safeAck(ack, () => {
    const { room, playerId } = identity(); room.updateConstitution(playerId, payload); return undefined;
  }));
  socket.on('constitution:confirm', (_payload: unknown, ack?: (value: Ack) => void) => safeAck(ack, () => {
    const { room, playerId } = identity(); room.confirmConstitution(playerId); return undefined;
  }));
  socket.on('constitution:lock', (_payload: unknown, ack?: (value: Ack) => void) => safeAck(ack, () => {
    const { room, playerId } = identity(); room.lockConstitution(playerId); return undefined;
  }));
  socket.on('governance:submit', (payload: { text: string }, ack?: (value: Ack) => void) => safeAck(ack, async () => {
    const { room, playerId } = identity(); await room.submitRule(playerId, payload.text); return undefined;
  }));
  socket.on('governance:vote', (payload: { vote: RuleVote }, ack?: (value: Ack) => void) => safeAck(ack, () => {
    const { room, playerId } = identity(); room.voteRule(playerId, payload.vote); return undefined;
  }));
  socket.on('governance:confirm-rule', (_payload: unknown, ack?: (value: Ack) => void) => safeAck(ack, () => {
    const { room, playerId } = identity(); room.confirmRule(playerId); return undefined;
  }));
  socket.on('governance:skip', (payload: { all?: boolean }, ack?: (value: Ack) => void) => safeAck(ack, () => {
    const { room, playerId } = identity(); room.skipRule(playerId, Boolean(payload.all)); return undefined;
  }));
  socket.on('game:attempt', (payload: ActionAttempt, ack?: (value: Ack<ActionReceipt>) => void) => safeAck(ack, () => {
    const { room, playerId } = identity();
    return room.gameAttempt(playerId, payload);
  }));
  socket.on('match:next', (_payload: unknown, ack?: (value: Ack) => void) => safeAck(ack, () => {
    const { room, playerId } = identity(); room.nextMatch(playerId); return undefined;
  }));
  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode as string | undefined;
    if (roomCode) {
      try { rooms.get(roomCode).detach(socket.id); } catch { /* room may be gone */ }
    }
  });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDist));
app.get('/{*path}', (_request, response) => response.sendFile(path.join(webDist, 'index.html')));

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(port, () => console.log(`MahjongPlus listening on http://localhost:${port}`));
}

export { app, httpServer, io, rooms };
