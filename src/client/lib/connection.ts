import type { ClientMessage, PongMessage, ServerMessage } from '../../shared/types';
import { SyncedClock } from './clock';

export interface Connection {
  send(msg: ClientMessage): void;
  clock: SyncedClock;
}

export type IncomingMessage = Exclude<ServerMessage, PongMessage>;

const PING_INTERVAL_MS = 10_000;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 10_000];

export function connect(onMessage: (msg: IncomingMessage) => void): Connection {
  const clock = new SyncedClock();
  let ws: WebSocket | null = null;
  let attempt = 0;
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  function open(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      attempt = 0;
      sendPing();
      pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMessage;
      if (msg.type === 'pong') clock.addSample(msg.t0, msg.serverTime, Date.now());
      else onMessage(msg);
    };
    ws.onclose = () => {
      clearInterval(pingTimer);
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt++;
      setTimeout(open, delay);
    };
    ws.onerror = () => ws?.close();
  }

  function sendPing(): void {
    send({ type: 'ping', t0: Date.now() });
  }

  function send(msg: ClientMessage): void {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  open();
  return { send, clock };
}
