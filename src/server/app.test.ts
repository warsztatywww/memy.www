import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ServerMessage } from '../shared/types';
import { createApp, type App } from './app';
import { loadConfig } from './config';

let dir: string;
let app: App;
let port: number;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'memiarka-app-'));
  const config = loadConfig({ MEDIA_DIR: join(dir, 'media'), ADS_DIR: join(dir, 'ads'), PORT: '0' });
  app = await createApp(config);
  await new Promise<void>((res) => app.server.listen(0, res));
  port = (app.server.address() as AddressInfo).port;
});

afterEach(async () => {
  await app.stop();
  await rm(dir, { recursive: true, force: true });
});

function openWs(): Promise<{ ws: WebSocket; messages: ServerMessage[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages: ServerMessage[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('app', () => {
  test('po połączeniu klient dostaje state (idle) i history', async () => {
    const { ws, messages } = await openWs();
    await wait(200);
    expect(messages.map((m) => m.type)).toEqual(['state', 'history']);
    const state = messages[0];
    if (state.type !== 'state') throw new Error('unreachable');
    expect(state.item.kind).toBe('idle');
    expect(state.serverNow).toBeTypeOf('number');
    ws.close();
  });

  test('ping → pong z t0 i serverTime', async () => {
    const { ws, messages } = await openWs();
    await wait(100);
    ws.send(JSON.stringify({ type: 'ping', t0: 12345 }));
    await wait(200);
    const pong = messages.find((m) => m.type === 'pong');
    expect(pong).toMatchObject({ type: 'pong', t0: 12345 });
    if (pong?.type === 'pong') expect(Math.abs(pong.serverTime - Date.now())).toBeLessThan(5000);
    ws.close();
  });

  test('nieznany/niepoprawny komunikat nie zabija serwera', async () => {
    const { ws } = await openWs();
    ws.send('to nie jest json{{{');
    ws.send(JSON.stringify({ type: 'costam' }));
    await wait(200);
    const { ws: ws2, messages: m2 } = await openWs();
    await wait(200);
    expect(m2.length).toBeGreaterThan(0);
    ws.close();
    ws2.close();
  });

  test('stop() kończy się mimo podłączonego klienta', async () => {
    const { ws } = await openWs();
    await wait(100);
    // klient celowo NIE jest zamykany
    await expect(
      Promise.race([
        app.stop().then(() => 'stopped'),
        wait(3000).then(() => { throw new Error('stop() hang'); }),
      ]),
    ).resolves.toBe('stopped');
    ws.close(); // sprzątanie po terminate i tak jest no-opem
  });
});
