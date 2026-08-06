import { createWriteStream, existsSync, renameSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { RequestHandler } from 'express';
import { IMAGE_EXT, VIDEO_EXT } from '../shared/media-ext';

/** Zwraca komunikat błędu albo null, gdy nazwa jest bezpieczna i obsługiwana. */
export function validateUploadName(name: string): string | null {
  if (!name) return 'brak nazwy pliku';
  if (name !== basename(name) || name.includes('\\') || name.includes('\0')) {
    return 'niedozwolona nazwa pliku';
  }
  if (name.startsWith('.')) return 'niedozwolona nazwa pliku';
  const ext = extname(name).toLowerCase();
  if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) return 'nieobsługiwany typ pliku';
  return null;
}

/** POST z surowym body: zapis do `<nazwa>.tmp`, po sukcesie atomiczny rename.
 *  Chokidar ignoruje `.tmp` (złe rozszerzenie), więc do biblioteki trafia
 *  dopiero gotowy plik. */
export function uploadHandler(dir: string): RequestHandler {
  return (req, res) => {
    const name = String(req.query.name ?? '');
    const invalid = validateUploadName(name);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    const target = join(dir, name);
    if (existsSync(target)) {
      res.status(409).json({ error: 'plik o tej nazwie już istnieje' });
      return;
    }
    const tmp = `${target}.tmp`;
    const out = createWriteStream(tmp, { flags: 'wx' });
    let failed = false;
    const fail = (status: number, msg: string): void => {
      if (failed) return;
      failed = true;
      out.destroy();
      void rm(tmp, { force: true });
      if (!res.headersSent) res.status(status).json({ error: msg });
    };
    out.on('error', () => fail(500, 'błąd zapisu'));
    req.on('error', () => fail(500, 'przerwane wysyłanie'));
    res.on('close', () => {
      // Połączenie padło przed wysłaniem odpowiedzi → sprzątamy niedokończony plik.
      if (!res.writableEnded) fail(500, 'przerwane wysyłanie');
    });
    out.on('finish', () => {
      if (failed) return;
      if (existsSync(target)) {
        // Ktoś wgrał tę nazwę równolegle — nie nadpisujemy (świadomie bez pełnej atomiczności).
        void rm(tmp, { force: true });
        res.status(409).json({ error: 'plik o tej nazwie już istnieje' });
        return;
      }
      try {
        renameSync(tmp, target);
        res.status(201).json({ ok: true });
      } catch {
        void rm(tmp, { force: true });
        res.status(500).json({ error: 'błąd zapisu' });
      }
    });
    req.pipe(out);
  };
}
