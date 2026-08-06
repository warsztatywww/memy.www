import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
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

async function startApp(): Promise<void> {
  const config = loadConfig({
    MEDIA_DIR: join(dir, 'media'),
    ADS_DIR: join(dir, 'ads'),
    DATA_DIR: join(dir, 'data'),
    PORT: '0',
    HA_TOKEN: 't',
    STATUS_INTERVAL: '1',
  });
  app = await createApp(config, { fetchFn: async () => { throw new Error('offline w testach'); } });
  await new Promise<void>((res) => app.server.listen(0, res));
  port = (app.server.address() as AddressInfo).port;
}

// Restart z memami na dysku — initial scan biblioteki widzi je od razu,
// bez czekania na stabilityThreshold watchera.
async function restartWithMemes(...names: string[]): Promise<void> {
  await app.stop();
  await mkdir(join(dir, 'media'), { recursive: true });
  for (const n of names) await writeFile(join(dir, 'media', n), 'x');
  await startApp();
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'memiarka-app-'));
  await startApp();
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
  test('po połączeniu klient dostaje state (idle), history i ticker', async () => {
    const { ws, messages } = await openWs();
    await wait(200);
    expect(messages.slice(0, 3).map((m) => m.type)).toEqual(['state', 'history', 'ticker']);
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

  test('status z pollera dociera do klienta (offline → statusy unknown)', async () => {
    const { ws, messages } = await openWs();
    await wait(500);
    const status = messages.find((m) => m.type === 'status');
    expect(status).toBeDefined();
    if (status?.type !== 'status') throw new Error('unreachable');
    expect(status.pantry.ser.status).toBe('unknown');
    expect(status.showers.qwwwetek.light).toBe('unknown');
    ws.close();
  });

  test('addTicker broadcastuje listę, removeTicker usuwa', async () => {
    const { ws, messages } = await openWs();
    await wait(100);
    ws.send(JSON.stringify({ type: 'addTicker', text: '  Jutro grill!  ' }));
    await wait(200);
    let ticker = messages.filter((m) => m.type === 'ticker').at(-1);
    if (ticker?.type !== 'ticker') throw new Error('brak ticker');
    expect(ticker.messages.map((m) => m.text)).toEqual(['Jutro grill!']);
    ws.send(JSON.stringify({ type: 'removeTicker', id: ticker.messages[0].id }));
    await wait(200);
    ticker = messages.filter((m) => m.type === 'ticker').at(-1);
    if (ticker?.type !== 'ticker') throw new Error('brak ticker');
    expect(ticker.messages).toEqual([]);
    ws.close();
  });

  test('nowy klient dostaje aktualny ticker przy połączeniu', async () => {
    const { ws } = await openWs();
    await wait(100);
    ws.send(JSON.stringify({ type: 'addTicker', text: 'trwały komunikat' }));
    await wait(200);
    const { ws: ws2, messages: m2 } = await openWs();
    await wait(200);
    const ticker = m2.find((m) => m.type === 'ticker');
    if (ticker?.type !== 'ticker') throw new Error('brak ticker');
    expect(ticker.messages.map((m) => m.text)).toEqual(['trwały komunikat']);
    ws.close();
    ws2.close();
  });
});

describe('app: zgłaszanie i skip', () => {
  test('report przenosi mema do trash i natychmiast skipuje, jeśli gra', async () => {
    await restartWithMemes('zly.jpg');
    const { ws, messages } = await openWs();
    await wait(200);
    const before = messages.filter((m) => m.type === 'state').at(-1);
    if (before?.type !== 'state') throw new Error('brak state');
    expect(before.item.name).toBe('zly.jpg');
    ws.send(JSON.stringify({ type: 'report', file: 'zly.jpg', reason: 'To nie jest mem' }));
    await wait(300);
    expect(existsSync(join(dir, 'media', 'trash', 'zly.jpg'))).toBe(true);
    expect(existsSync(join(dir, 'media', 'zly.jpg'))).toBe(false);
    const after = messages.filter((m) => m.type === 'state').at(-1);
    if (after?.type !== 'state') throw new Error('brak state');
    expect(after.item.kind).toBe('idle'); // jedyny mem zgłoszony → skip → idle
    ws.close();
  });

  test('report z powodem spoza listy jest ignorowany', async () => {
    await restartWithMemes('ok.jpg');
    const { ws } = await openWs();
    await wait(200);
    ws.send(JSON.stringify({ type: 'report', file: 'ok.jpg', reason: 'bo tak' }));
    await wait(300);
    expect(existsSync(join(dir, 'media', 'ok.jpg'))).toBe(true);
    ws.close();
  });

  test('report nieznanego pliku jest ignorowany, serwer żyje', async () => {
    const { ws } = await openWs();
    await wait(100);
    ws.send(JSON.stringify({ type: 'report', file: 'ghost.jpg', reason: 'To nie jest mem' }));
    await wait(200);
    const { ws: ws2, messages: m2 } = await openWs();
    await wait(200);
    expect(m2.length).toBeGreaterThan(0);
    ws.close();
    ws2.close();
  });

  test('kolizja nazwy w koszu → plik z prefiksem timestampa', async () => {
    await restartWithMemes('a.jpg');
    await mkdir(join(dir, 'media', 'trash'), { recursive: true });
    await writeFile(join(dir, 'media', 'trash', 'a.jpg'), 'stary');
    const { ws } = await openWs();
    await wait(200);
    ws.send(JSON.stringify({ type: 'report', file: 'a.jpg', reason: 'To jest mem Grzegorza' }));
    await wait(300);
    const files = await readdir(join(dir, 'media', 'trash'));
    expect(files).toHaveLength(2);
    expect(files.some((f) => /^\d+-a\.jpg$/.test(f))).toBe(true);
    ws.close();
  });

  test('wiadomość skip przerywa bieżący element', async () => {
    await restartWithMemes('a.jpg', 'b.jpg');
    const { ws, messages } = await openWs();
    await wait(200);
    const count = messages.filter((m) => m.type === 'state').length;
    ws.send(JSON.stringify({ type: 'skip' }));
    await wait(300);
    expect(messages.filter((m) => m.type === 'state').length).toBeGreaterThan(count);
    ws.close();
  });
});
