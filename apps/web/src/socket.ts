import { io } from 'socket.io-client';
import type { Ack } from '@mahjongplus/shared';

export const socket = io();

export function emit<T>(event: string, payload: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (ack: Ack<T>) => {
      if (ack.ok) resolve(ack.data as T);
      else reject(new Error(ack.error ?? '操作失败'));
    });
  });
}
