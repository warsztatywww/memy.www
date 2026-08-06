import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { moveToTrash } from './trash';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'memiarka-trash-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('moveToTrash', () => {
  test('przenosi plik do MEDIA_DIR/trash (tworząc katalog)', async () => {
    await writeFile(join(dir, 'a.jpg'), 'x');
    const dest = await moveToTrash(dir, 'a.jpg');
    expect(dest).toBe(join(dir, 'trash', 'a.jpg'));
    expect(existsSync(join(dir, 'a.jpg'))).toBe(false);
    expect(existsSync(dest)).toBe(true);
  });

  test('kolizja nazwy → prefiks z timestampem, nic nie nadpisane', async () => {
    await writeFile(join(dir, 'a.jpg'), 'nowy');
    await mkdir(join(dir, 'trash'), { recursive: true });
    await writeFile(join(dir, 'trash', 'a.jpg'), 'stary');
    const dest = await moveToTrash(dir, 'a.jpg');
    expect(basename(dest)).toMatch(/^\d+-a\.jpg$/);
    expect(await readdir(join(dir, 'trash'))).toHaveLength(2);
  });

  test('brak pliku źródłowego → reject', async () => {
    await expect(moveToTrash(dir, 'ghost.jpg')).rejects.toThrow();
  });
});
