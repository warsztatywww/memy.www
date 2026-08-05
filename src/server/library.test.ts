import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MediaLibrary } from './library';
import type { MediaItem } from './library';

const fakeProbe = async () => 5000;

let dir: string;
let lib: MediaLibrary | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'memiarka-'));
});
afterEach(async () => {
  await lib?.stop();
  lib = undefined;
  await rm(dir, { recursive: true, force: true });
});

function waitFor<T>(emitter: MediaLibrary, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${event}`)), timeoutMs);
    emitter.once(event, (v: T) => { clearTimeout(t); resolve(v); });
  });
}

describe('MediaLibrary', () => {
  test('skan początkowy klasyfikuje pliki i mierzy długość wideo', async () => {
    await writeFile(join(dir, 'a.jpg'), 'x');
    await writeFile(join(dir, 'b.mp4'), 'x');
    await writeFile(join(dir, 'notes.txt'), 'x'); // ignorowany
    lib = new MediaLibrary(dir, { probe: fakeProbe, stabilityThreshold: 50 });
    await lib.start();
    const items = lib.items().sort((a, b) => a.file.localeCompare(b.file));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ file: 'a.jpg', type: 'image' });
    expect(items[1]).toMatchObject({ file: 'b.mp4', type: 'video', duration: 5000 });
  });

  test('videosOnly ignoruje obrazki', async () => {
    await writeFile(join(dir, 'a.jpg'), 'x');
    await writeFile(join(dir, 'b.webm'), 'x');
    lib = new MediaLibrary(dir, { probe: fakeProbe, videosOnly: true, stabilityThreshold: 50 });
    await lib.start();
    expect(lib.items().map((i) => i.file)).toEqual(['b.webm']);
  });

  test('nowy plik po starcie emituje added', async () => {
    lib = new MediaLibrary(dir, { probe: fakeProbe, stabilityThreshold: 50 });
    await lib.start();
    const added = waitFor<MediaItem>(lib, 'added');
    await writeFile(join(dir, 'nowy.png'), 'x');
    expect((await added).file).toBe('nowy.png');
    expect(lib.get('nowy.png')).toBeDefined();
  });

  test('plik z błędem probe jest pomijany', async () => {
    await writeFile(join(dir, 'zepsuty.mp4'), 'x');
    lib = new MediaLibrary(dir, {
      probe: async () => { throw new Error('bad file'); },
      stabilityThreshold: 50,
    });
    await lib.start();
    expect(lib.items()).toHaveLength(0);
  });

  test('usunięcie pliku emituje removed', async () => {
    await writeFile(join(dir, 'a.jpg'), 'x');
    lib = new MediaLibrary(dir, { probe: fakeProbe, stabilityThreshold: 50 });
    await lib.start();
    const removed = waitFor<string>(lib, 'removed');
    await rm(join(dir, 'a.jpg'));
    expect(await removed).toBe('a.jpg');
    expect(lib.items()).toHaveLength(0);
  });

  test('plik istniejący przed startem nie emituje added po starcie', async () => {
    await writeFile(join(dir, 'stary.jpg'), 'x');
    lib = new MediaLibrary(dir, { probe: fakeProbe, stabilityThreshold: 50 });
    await lib.start();
    const added: string[] = [];
    lib.on('added', (i: MediaItem) => added.push(i.file));
    await new Promise((r) => setTimeout(r, 300));
    expect(added).toEqual([]);
    expect(lib.items().map((i) => i.file)).toEqual(['stary.jpg']);
  });
});
