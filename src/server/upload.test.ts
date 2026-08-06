import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ServerMessage } from '../shared/types';
import { createApp, type App } from './app';
import { loadConfig } from './config';
import { validateUploadName } from './upload';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('validateUploadName', () => {
  test('akceptuje poprawne nazwy obrazów i wideo', () => {
    expect(validateUploadName('kot.jpg')).toBeNull();
    expect(validateUploadName('KOT.JPG')).toBeNull();
    expect(validateUploadName('śmieszny mem (2).webm')).toBeNull();
  });

  test('odrzuca path traversal i separatory ścieżek', () => {
    expect(validateUploadName('../evil.jpg')).not.toBeNull();
    expect(validateUploadName('a/b.jpg')).not.toBeNull();
    expect(validateUploadName('a\\b.jpg')).not.toBeNull();
    expect(validateUploadName('a\0.jpg')).not.toBeNull();
  });

  test('odrzuca nazwy zaczynające się od kropki', () => {
    expect(validateUploadName('.ukryty.jpg')).not.toBeNull();
  });

  test('odrzuca złe rozszerzenia i brak nazwy', () => {
    expect(validateUploadName('wirus.exe')).not.toBeNull();
    expect(validateUploadName('kot.jpg.tmp')).not.toBeNull();
    expect(validateUploadName('bez-rozszerzenia')).not.toBeNull();
    expect(validateUploadName('')).not.toBeNull();
  });
});

describe('POST /api/upload', () => {
  let dir: string;
  let app: App;
  let port: number;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'memiarka-upload-'));
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
  });

  afterEach(async () => {
    await app.stop();
    await rm(dir, { recursive: true, force: true });
  });

  const upload = (name: string, body: string): Promise<Response> =>
    fetch(`http://127.0.0.1:${port}/api/upload?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body,
    });

  test('201 — plik ląduje w MEDIA_DIR z tą samą zawartością', async () => {
    const res = await upload('kot.jpg', 'udawany-obrazek');
    expect(res.status).toBe(201);
    const saved = await readFile(join(dir, 'media', 'kot.jpg'), 'utf8');
    expect(saved).toBe('udawany-obrazek');
    const files = await readdir(join(dir, 'media'));
    expect(files).toEqual(['kot.jpg']); // brak śladu po .tmp
  });

  test('409 przy kolizji — oryginalny plik nietknięty', async () => {
    await writeFile(join(dir, 'media', 'kot.jpg'), 'oryginał');
    const res = await upload('kot.jpg', 'podmiana');
    expect(res.status).toBe(409);
    expect(await readFile(join(dir, 'media', 'kot.jpg'), 'utf8')).toBe('oryginał');
  });

  test('400 — traversal, kropka na początku, złe rozszerzenie, brak name', async () => {
    expect((await upload('../evil.jpg', 'x')).status).toBe(400);
    expect((await upload('.ukryty.jpg', 'x')).status).toBe(400);
    expect((await upload('wirus.exe', 'x')).status).toBe(400);
    const noName = await fetch(`http://127.0.0.1:${port}/api/upload`, { method: 'POST', body: 'x' });
    expect(noName.status).toBe(400);
    expect(await readdir(join(dir, 'media'))).toEqual([]);
  });

  test('przerwany upload nie zostawia plików (.tmp ani docelowego)', async () => {
    await new Promise<void>((resolve) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: `/api/upload?name=${encodeURIComponent('urwany.jpg')}`,
        method: 'POST',
        headers: { 'content-length': '1000000' },
      });
      req.on('error', () => resolve());
      req.write('tylko kawałek');
      setTimeout(() => req.destroy(), 100);
    });
    await wait(300); // czas na asynchroniczne sprzątnięcie .tmp
    expect(await readdir(join(dir, 'media'))).toEqual([]);
  });

  test('wrzucony mem wchodzi do rotacji z banerem NOWY MEM', async () => {
    const { messages } = await new Promise<{ ws: WebSocket; messages: ServerMessage[] }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const msgs: ServerMessage[] = [];
      ws.on('message', (raw) => msgs.push(JSON.parse(String(raw))));
      ws.on('open', () => resolve({ ws, messages: msgs }));
      ws.on('error', reject);
    });
    expect((await upload('nowy.png', 'px')).status).toBe(201);
    await wait(3500); // chokidar awaitWriteFinish: stabilityThreshold 2000 ms + zapas
    const state = messages.filter((m) => m.type === 'state').at(-1);
    if (state?.type !== 'state') throw new Error('brak state');
    expect(state.item.name).toBe('nowy.png');
    expect(state.newMem).toBe(true);
  }, 10_000);
});
