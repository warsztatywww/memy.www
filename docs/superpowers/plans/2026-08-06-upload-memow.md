# Upload memów z panelu — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload memów z panelu (`/`) przez drag&drop na całej stronie i guzik „Wybierz pliki" — endpoint `POST /api/upload` zapisuje plik do `MEDIA_DIR`, resztę (wykrycie, „NOWY MEM!") robi istniejący watcher.

**Architecture:** Serwer dostaje nowy moduł `src/server/upload.ts` (walidacja nazwy + streaming zapis `.tmp` → atomiczny `rename`), montowany w `app.ts` jako `POST /api/upload?name=<nazwa>`. Panel dostaje sekcję „Wrzuć mema" i moduł `src/client/panel/upload.ts` (kolejka sekwencyjna XHR z progresem, overlay drag&drop na całym oknie). Zestawy rozszerzeń wędrują do `src/shared/media-ext.ts`, żeby serwer i klient używały jednej definicji.

**Tech Stack:** Node 22+, Express 5, TypeScript (ESM, strict), Vite (klient), vitest. Spec: `docs/superpowers/specs/2026-08-06-upload-memow-design.md`.

## Global Constraints

- **Zero nowych zależności** — żadnych nowych wpisów w `package.json`.
- Komentarze, komunikaty UI i opisy testów **po polsku** (konwencja repo).
- Komunikaty commitów w stylu repo: `feat:`/`fix:`/`docs:` + opis po polsku.
- Rozszerzenia obsługiwane: `.jpg .jpeg .png .gif .webp` (obrazy), `.mp4 .webm` (wideo) — dokładnie te co dziś w `library.ts`.
- Bez limitu rozmiaru uploadu. Bez autoryzacji (zaufana sieć). Upload reklam poza zakresem — ale `uploadHandler(dir)` przyjmuje katalog parametrem.
- Testy: `npm test` (vitest), typy: `npm run typecheck`, build klienta: `npm run build`.
- W testach integracyjnych serwer HTTP na porcie `0` + `loadConfig` z env-obiektem — wzorzec z `src/server/app.test.ts` (wymaga `HA_TOKEN: 't'` w env-obiekcie, inaczej `loadConfig` rzuca).

---

### Task 1: Wspólne rozszerzenia + walidacja nazwy pliku

**Files:**
- Create: `src/shared/media-ext.ts`
- Modify: `src/server/library.ts:7-8` (usunięcie lokalnych stałych, import ze shared)
- Create: `src/server/upload.ts` (na razie tylko `validateUploadName`)
- Test: `src/server/upload.test.ts` (na razie tylko testy jednostkowe walidacji)

**Interfaces:**
- Consumes: nic (pierwsze zadanie).
- Produces:
  - `src/shared/media-ext.ts`: `export const IMAGE_EXT: Set<string>`, `export const VIDEO_EXT: Set<string>` — zestawy rozszerzeń z kropką, lowercase.
  - `src/server/upload.ts`: `export function validateUploadName(name: string): string | null` — `null` gdy nazwa OK, inaczej polski komunikat błędu.
  - `src/server/library.ts` eksportuje to samo co dziś (`MediaLibrary`, `MediaItem`, `MediaSource`, `MediaLibraryOptions`) — zmienia się tylko źródło stałych.

- [ ] **Step 1: Napisz failing testy walidacji**

Utwórz `src/server/upload.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { validateUploadName } from './upload';

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
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npx vitest run src/server/upload.test.ts`
Expected: FAIL — moduł `./upload` nie istnieje.

- [ ] **Step 3: Utwórz `src/shared/media-ext.ts`**

```ts
// Wspólne zestawy rozszerzeń mediów — używane przez serwer (biblioteka, upload) i panel.
export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
export const VIDEO_EXT = new Set(['.mp4', '.webm']);
```

- [ ] **Step 4: Przestaw `library.ts` na import ze shared**

W `src/server/library.ts` usuń linie:

```ts
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.webm']);
```

i dodaj do importów u góry pliku:

```ts
import { IMAGE_EXT, VIDEO_EXT } from '../shared/media-ext';
```

- [ ] **Step 5: Utwórz `src/server/upload.ts` z walidacją**

```ts
import { basename, extname } from 'node:path';
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
```

Uwaga: `basename('a\\b.jpg')` na Linuksie zwraca całość, stąd osobny warunek na `\\`. `kot.jpg.tmp` odpada na rozszerzeniu (`.tmp` nie jest na liście) — to ważne, bo `.tmp` to nasz sufiks roboczy.

- [ ] **Step 6: Uruchom testy i typecheck — mają przechodzić**

Run: `npx vitest run src/server/upload.test.ts && npm run typecheck`
Expected: PASS, bez błędów typów.

- [ ] **Step 7: Uruchom cały test suite (refaktor library.ts niczego nie psuje)**

Run: `npm test`
Expected: PASS (wszystkie dotychczasowe testy zielone).

- [ ] **Step 8: Commit**

```bash
git add src/shared/media-ext.ts src/server/library.ts src/server/upload.ts src/server/upload.test.ts
git commit -m "feat: walidacja nazw uploadu + wspólne zestawy rozszerzeń w shared"
```

---

### Task 2: Endpoint `POST /api/upload` — streaming zapis + montaż w app

**Files:**
- Modify: `src/server/upload.ts` (dodanie `uploadHandler`)
- Modify: `src/server/app.ts:52-57` (montaż endpointu przy pozostałych trasach)
- Test: `src/server/upload.test.ts` (dopisanie testów integracyjnych)

**Interfaces:**
- Consumes: `validateUploadName` z Task 1; `createApp(config, opts)` i `loadConfig(env)` — istniejące, bez zmian sygnatur.
- Produces:
  - `src/server/upload.ts`: `export function uploadHandler(dir: string): RequestHandler` (typ z `express`) — handler `POST`, nazwa pliku w `req.query.name`, body = surowa zawartość pliku. Odpowiedzi: `201 {ok:true}`, `400/409/500 {error:string}`.
  - Trasa `POST /api/upload?name=<URL-encoded nazwa>` na serwerze aplikacji (Task 3 z niej korzysta).

- [ ] **Step 1: Dopisz failing testy integracyjne**

Dopisz do `src/server/upload.test.ts` (obok istniejącego describe; rozszerz importy u góry pliku):

```ts
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
```

oraz nowy blok:

```ts
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
```

- [ ] **Step 2: Uruchom testy — nowe mają failować**

Run: `npx vitest run src/server/upload.test.ts`
Expected: testy walidacji PASS, cały nowy describe FAIL (404 — brak trasy).

- [ ] **Step 3: Dopisz `uploadHandler` w `src/server/upload.ts`**

Rozszerz importy i dodaj funkcję:

```ts
import { createWriteStream, existsSync, renameSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { RequestHandler } from 'express';
import { IMAGE_EXT, VIDEO_EXT } from '../shared/media-ext';
```

```ts
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
```

Uwaga: żaden body-parser nie jest zamontowany w `app.ts`, więc `req` to nietknięty strumień — `req.pipe(out)` streamuje na dysk bez buforowania w RAM (brak limitu rozmiaru jest przez to bezpieczny dla pamięci).

- [ ] **Step 4: Zamontuj trasę w `src/server/app.ts`**

Dodaj do importów:

```ts
import { uploadHandler } from './upload';
```

i po linii `app.use('/ads', express.static(config.adsDir));` dodaj:

```ts
app.post('/api/upload', uploadHandler(config.mediaDir));
```

- [ ] **Step 5: Uruchom testy uploadu — mają przechodzić**

Run: `npx vitest run src/server/upload.test.ts`
Expected: PASS (w tym e2e z NOWY MEM — trwa ~4 s, to normalne).

- [ ] **Step 6: Cały suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/upload.ts src/server/upload.test.ts src/server/app.ts
git commit -m "feat: endpoint POST /api/upload — streaming zapis memów do MEDIA_DIR"
```

---

### Task 3: Panel — sekcja „Wrzuć mema", drag&drop na całej stronie, README

**Files:**
- Modify: `src/client/index.html` (sekcja upload + overlay)
- Modify: `src/client/panel/style.css` (style dropzone/overlay/listy wyników)
- Create: `src/client/panel/upload.ts`
- Modify: `src/client/panel/main.ts:1-2` (import modułu)
- Modify: `README.md` (wzmianka o uploadzie z panelu)

**Interfaces:**
- Consumes: `POST /api/upload?name=<URL-encoded>` z Task 2 (`201` sukces, inaczej JSON `{error}`); `IMAGE_EXT`/`VIDEO_EXT` z `src/shared/media-ext.ts` (Task 1).
- Produces: samodzielny moduł efektów ubocznych `src/client/panel/upload.ts` — importowany raz z `main.ts`, niczego nie eksportuje na zewnątrz. Wymaga elementów DOM: `#upload-pick`, `#upload-input`, `#upload-results`, `#drop-overlay`.

- [ ] **Step 1: HTML — sekcja i overlay**

W `src/client/index.html` wstaw między sekcją `#now-playing` a `#ticker-section`:

```html
  <section id="upload-section">
    <h2>Wrzuć mema</h2>
    <div id="upload-dropzone">
      <span>przeciągnij pliki tutaj albo</span>
      <button id="upload-pick" type="button">Wybierz pliki</button>
      <input id="upload-input" type="file" multiple hidden
             accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm">
    </div>
    <ul id="upload-results"></ul>
  </section>
```

a przed `<script type="module" ...>` dodaj:

```html
  <div id="drop-overlay" hidden>upuść, by wrzucić mema</div>
```

- [ ] **Step 2: CSS**

Dopisz na końcu `src/client/panel/style.css`:

```css
#upload-dropzone { display: flex; align-items: center; justify-content: center; gap: 0.75rem; border: 2px dashed #444; border-radius: 0.5rem; padding: 1.5rem; color: #999; }
#upload-results { margin-top: 0.75rem; }
#upload-results:empty { margin-top: 0; }
.upload-status { margin-left: auto; white-space: nowrap; color: #999; font-variant-numeric: tabular-nums; }
li.upload-ok .upload-status { color: #6fc36f; }
li.upload-error .upload-status { color: #e07a7a; }
.upload-remove { background: #a53a3a; padding: 0.3rem 0.7rem; }
#drop-overlay { position: fixed; inset: 0; background: rgba(20, 20, 28, 0.85); border: 4px dashed #7ab8ff; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: #7ab8ff; z-index: 10; pointer-events: none; }
#drop-overlay[hidden] { display: none; }
```

(`pointer-events: none` na overlayu — dzięki temu `drop` przelatuje do okna i nie trzeba wieszać słuchaczy na samym overlayu.)

- [ ] **Step 3: Moduł `src/client/panel/upload.ts`**

```ts
import { IMAGE_EXT, VIDEO_EXT } from '../../shared/media-ext';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel)!;
const pickBtn = $<HTMLButtonElement>('#upload-pick');
const fileInput = $<HTMLInputElement>('#upload-input');
const resultList = $<HTMLUListElement>('#upload-results');
const overlay = $('#drop-overlay');

const SUCCESS_HIDE_MS = 5000;

interface Entry {
  file: File;
  li: HTMLLIElement;
  status: HTMLSpanElement;
}

const queue: Entry[] = [];
let uploading = false;

function hasSupportedExt(name: string): boolean {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext);
}

function addResult(name: string): { li: HTMLLIElement; status: HTMLSpanElement } {
  const li = document.createElement('li');
  const nameEl = document.createElement('span');
  nameEl.className = 'name';
  nameEl.textContent = name;
  const status = document.createElement('span');
  status.className = 'upload-status';
  li.append(nameEl, status);
  resultList.append(li);
  return { li, status };
}

function fail(entry: Entry, msg: string): void {
  entry.status.textContent = `✗ ${msg}`;
  entry.li.classList.add('upload-error');
  const close = document.createElement('button');
  close.className = 'upload-remove';
  close.textContent = '✕';
  close.title = 'Zamknij';
  close.addEventListener('click', () => entry.li.remove());
  entry.li.append(close);
}

function enqueueFiles(files: Iterable<File>): void {
  for (const file of files) {
    const entry: Entry = { file, ...addResult(file.name) };
    if (!hasSupportedExt(file.name)) {
      fail(entry, 'nieobsługiwany typ pliku');
      continue;
    }
    entry.status.textContent = 'w kolejce';
    queue.push(entry);
  }
  void processQueue();
}

async function processQueue(): Promise<void> {
  if (uploading) return;
  uploading = true;
  let entry: Entry | undefined;
  while ((entry = queue.shift())) await uploadOne(entry);
  uploading = false;
}

function uploadOne(entry: Entry): Promise<void> {
  // XHR zamiast fetch — fetch nie raportuje progresu wysyłania.
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?name=${encodeURIComponent(entry.file.name)}`);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        entry.status.textContent = `wysyłanie… ${Math.round((e.loaded / e.total) * 100)}%`;
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status === 201) {
        entry.status.textContent = '✓ wrzucony';
        entry.li.classList.add('upload-ok');
        setTimeout(() => entry.li.remove(), SUCCESS_HIDE_MS);
      } else {
        let msg = 'błąd wysyłania';
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
        } catch { /* zostaje domyślny komunikat */ }
        fail(entry, msg);
      }
      resolve();
    });
    xhr.addEventListener('error', () => {
      fail(entry, 'błąd wysyłania');
      resolve();
    });
    entry.status.textContent = 'wysyłanie… 0%';
    xhr.send(entry.file);
  });
}

pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) enqueueFiles(fileInput.files);
  fileInput.value = '';
});

// Drag&drop na całym oknie: licznik zagłębienia, bo dragenter/dragleave
// odpalają się na każdym elemencie po drodze.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  overlay.hidden = false;
});
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    overlay.hidden = true;
  }
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  if (e.dataTransfer?.files.length) enqueueFiles(e.dataTransfer.files);
});
```

- [ ] **Step 4: Import w `main.ts`**

Na górze `src/client/panel/main.ts`, po istniejących importach, dodaj:

```ts
import './upload';
```

- [ ] **Step 5: Typecheck + build + testy**

Run: `npm run typecheck && npm run build && npm test`
Expected: wszystko PASS, build bez ostrzeżeń o brakujących modułach.

- [ ] **Step 6: Smoke test w przeglądarce**

Uruchom `HA_TOKEN=t npm run dev`, otwórz `http://localhost:8080/`:
- kliknij „Wybierz pliki", wgraj obrazek → wpis „wysyłanie… → ✓ wrzucony", po chwili mem gra w „Teraz gra" z banerem „NOWY MEM!", wpis znika po ~5 s;
- wgraj ten sam plik drugi raz → „✗ plik o tej nazwie już istnieje", wpis zostaje z guzikiem ✕;
- przeciągnij plik nad okno → pełnoekranowy overlay „upuść, by wrzucić mema"; upuść → upload; przeciągnij i wyjedź poza okno → overlay znika;
- przeciągnij plik `.txt` razem z obrazkiem → obrazek się wysyła, `.txt` dostaje „✗ nieobsługiwany typ pliku".

(Jeśli wykonawca nie ma przeglądarki — pomiń, zaznacz w raporcie do weryfikacji przez człowieka.)

- [ ] **Step 7: README**

W `README.md` zmień akapit:

```markdown
Memy wrzucaj do `./media` (jpg/png/gif/webp/mp4/webm), reklamy (wideo) do `./ads`.
```

na:

```markdown
Memy wrzucaj do `./media` (jpg/png/gif/webp/mp4/webm) — albo przez panel:
drag&drop na stronę lub guzik „Wybierz pliki" w sekcji „Wrzuć mema".
Reklamy (wideo) wrzucaj do `./ads`.
```

- [ ] **Step 8: Commit**

```bash
git add src/client/index.html src/client/panel/style.css src/client/panel/upload.ts src/client/panel/main.ts README.md
git commit -m "feat: upload memów z panelu — drag&drop i guzik Wybierz pliki"
```
