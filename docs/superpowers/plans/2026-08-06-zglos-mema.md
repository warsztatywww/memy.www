# Zgłoś mema + guzik Skip — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zgłaszanie mema z panelu (mem ląduje w `MEDIA_DIR/trash` i wypada z rotacji, z natychmiastowym skipem jeśli gra) + uogólnienie „Przerwij reklamę" do „Skip".

**Architecture:** Zgłoszenie idzie po istniejącym WebSockecie jako `{type:'report', file, reason}`. Serwer przenosi plik do `MEDIA_DIR/trash` (atomowy rename, watcher biblioteki skanuje tylko depth 0, więc kosz jest niewidoczny), po czym **synchronicznie** usuwa mema z `MediaLibrary` (nowa metoda `remove()`), czyści go z kolejki nowych memów i skipuje, jeśli właśnie gra. Wiadomość `stopAd` zostaje zastąpiona ogólnym `skip`.

**Tech Stack:** Node 22+, TypeScript (ESM), Express 5, ws, chokidar, Vitest, Vite (klient bez frameworka).

**Spec:** `docs/superpowers/specs/2026-08-06-zglos-mema-design.md`

## Global Constraints

- Teksty UI po polsku; komentarze i komunikaty commitów po polsku, w stylu repo (`feat:`/`fix:` + krótki opis).
- Powody zgłoszenia — dokładnie ta lista, verbatim: „To nie jest mem", „Jestem na tym zdjęciu i nie podoba mi się to", „Nie ma mnie na tym zdjęciu i nie podoba mi się to", „To jest mem Grzegorza", „Ten mem jest niezgodny z SOM".
- Kosz: `MEDIA_DIR/trash`; kolizja nazwy → prefiks `<timestamp>-` (`Date.now()`), nigdy nadpisanie.
- Powód NIE jest zapisywany trwale — tylko `console.log` na serwerze.
- Zero nowych zależności npm.
- Każdy commit z stopką `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Testy: `npm test` (vitest run), typy: `npm run typecheck`.

Uwaga do spec: spec mówi o `mkdir trash` przy starcie aplikacji — plan robi to wewnątrz `moveToTrash()` (`mkdir recursive` przed rename), co jest odporniejsze (działa też, gdy ktoś usunie kosz w trakcie działania) i nie dotyka startu aplikacji.

---

### Task 1: `stopAd` → `skip` (protokół, radio, panel)

**Files:**
- Modify: `src/shared/types.ts:58` (StopAdMessage → SkipMessage)
- Modify: `src/server/radio.ts:112-115` (`stopAd()` → `skip()`)
- Modify: `src/server/app.ts:96-97` (dispatch wiadomości)
- Modify: `src/client/index.html:19` (guzik)
- Modify: `src/client/panel/main.ts` (id guzika, logika disabled)
- Test: `src/server/radio.test.ts` (opis „komendy panelu")

**Interfaces:**
- Consumes: istniejące `Radio.advance()` (prywatne), `CurrentState.item.kind`.
- Produces: `Radio.skip(): void` — przeskakuje bieżący element (każdy kind poza `idle`; przy `idle` no-op); wiadomość klienta `{ type: 'skip' }` (interfejs `SkipMessage`); w unii `ClientMessage` nie ma już `StopAdMessage`. Task 5 używa `radio.skip()` i typu `SkipMessage`.

- [ ] **Step 1: Przepisz testy `stopAd` na `skip` w `src/server/radio.test.ts`**

Zastąp cały test `'stopAd przerywa tylko reklamę; kolejka nowych memów ma pierwszeństwo'` (linie 278-293) czterema testami:

```ts
  test('skip przerywa mema', async () => {
    const { radio, states } = setup({ memes: [img('a.jpg'), img('b.jpg')], config: { adInterval: 99 } });
    radio.start();
    const count = states.length;
    radio.skip();
    expect(states.length).toBe(count + 1);
    expect(states.at(-1)!.item.kind).toBe('image');
    radio.stop();
  });

  test('skip przerywa tryb specjalny', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg')],
      specials: [{ id: 'x', duration: 15_000 }],
      config: { adInterval: 99, specialIntervalMs: 5_000 },
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(10_001); // mem skończony → special
    expect(states.at(-1)!.item.kind).toBe('special');
    radio.skip();
    expect(states.at(-1)!.item.kind).toBe('image');
    radio.stop();
  });

  test('skip przerywa reklamę; kolejka nowych memów ma pierwszeństwo', async () => {
    const { radio, memes, states } = setup({
      memes: [img('a.jpg')],
      ads: [vid('r.mp4', 60_000)],
      config: { adInterval: 99 },
    });
    radio.start();
    radio.playAdNow();
    expect(states.at(-1)!.item.kind).toBe('ad');
    memes.add(img('swiezak.jpg')); // do kolejki
    radio.skip();
    expect(states.at(-1)!).toMatchObject({ newMem: true, item: { name: 'swiezak.jpg' } });
    radio.stop();
  });

  test('skip przy idle = no-op', () => {
    const { radio, states } = setup();
    radio.start();
    const count = states.length;
    radio.skip();
    expect(states.length).toBe(count);
    radio.stop();
  });
```

- [ ] **Step 2: Sprawdź, że testy failują**

Run: `npx vitest run src/server/radio.test.ts`
Expected: FAIL — `radio.skip is not a function` (4 nowe testy).

- [ ] **Step 3: Zamień `stopAd()` na `skip()` w `src/server/radio.ts`**

W miejscu metody `stopAd()` (linie 112-115):

```ts
  skip(): void {
    if (this.current.item.kind === 'idle') return;
    this.advance();
  }
```

- [ ] **Step 4: Zamień typ wiadomości w `src/shared/types.ts`**

Linia 58: `export interface StopAdMessage { type: 'stopAd'; }` →

```ts
export interface SkipMessage { type: 'skip'; }
```

W unii `ClientMessage` (linie 61-66) zamień `| StopAdMessage` na `| SkipMessage`.

- [ ] **Step 5: Zamień dispatch w `src/server/app.ts`**

Linie 96-97:

```ts
      } else if (msg.type === 'skip') {
        radio.skip();
```

- [ ] **Step 6: Zamień guzik w panelu**

`src/client/index.html` linia 19:

```html
      <button id="skip" disabled>Skip</button>
```

`src/client/panel/main.ts`:
- linia 9: `const stopAdBtn = $<HTMLButtonElement>('#stop-ad');` → `const skipBtn = $<HTMLButtonElement>('#skip');`
- linia 47: `stopAdBtn.addEventListener('click', () => conn.send({ type: 'stopAd' }));` → `skipBtn.addEventListener('click', () => conn.send({ type: 'skip' }));`
- linia 95 (w `renderNow`): `stopAdBtn.disabled = state.item.kind !== 'ad';` → `skipBtn.disabled = state.item.kind === 'idle';`

- [ ] **Step 7: Testy i typy przechodzą**

Run: `npm test && npm run typecheck`
Expected: PASS wszędzie (żadnych referencji do `stopAd` — sprawdź `grep -rn stopAd src/`, ma nic nie zwrócić).

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/server/radio.ts src/server/app.ts src/client/index.html src/client/panel/main.ts src/server/radio.test.ts
git commit -m "feat: guzik Skip zamiast „Przerwij reklamę\" — przeskakuje dowolny element"
```

---

### Task 2: `MediaLibrary.remove()`

**Files:**
- Modify: `src/server/library.ts` (nowa metoda + DRY w handlerze `unlink`)
- Test: `src/server/library.test.ts`

**Interfaces:**
- Produces: `MediaLibrary.remove(file: string): void` — usuwa wpis z mapy i emituje `'removed'` z nazwą pliku; dla nieznanego pliku nic nie robi (idempotentne — dzięki temu późniejszy `unlink` od chokidara po przeniesieniu pliku do kosza nie emituje drugi raz). Task 5 woła `memes.remove(file)`.

- [ ] **Step 1: Napisz failujące testy w `src/server/library.test.ts`**

Dopisz na końcu `describe('MediaLibrary', ...)`:

```ts
  test('remove() usuwa wpis i emituje removed', async () => {
    await writeFile(join(dir, 'a.jpg'), 'x');
    lib = new MediaLibrary(dir, { probe: fakeProbe, stabilityThreshold: 50 });
    await lib.start();
    const removed: string[] = [];
    lib.on('removed', (f: string) => removed.push(f));
    lib.remove('a.jpg');
    expect(removed).toEqual(['a.jpg']);
    expect(lib.get('a.jpg')).toBeUndefined();
  });

  test('remove() nieznanego pliku nic nie emituje', async () => {
    lib = new MediaLibrary(dir, { probe: fakeProbe, stabilityThreshold: 50 });
    await lib.start();
    const removed: string[] = [];
    lib.on('removed', (f: string) => removed.push(f));
    lib.remove('ghost.jpg');
    expect(removed).toEqual([]);
  });
```

- [ ] **Step 2: Sprawdź, że testy failują**

Run: `npx vitest run src/server/library.test.ts`
Expected: FAIL — `lib.remove is not a function`.

- [ ] **Step 3: Dodaj metodę w `src/server/library.ts`**

Po metodzie `get()` (linia 45):

```ts
  remove(file: string): void {
    if (this.byFile.delete(file)) this.emit('removed', file);
  }
```

Handler `unlink` (linie 65-68) uprość do:

```ts
    this.watcher.on('unlink', (p) => this.remove(basename(p)));
```

- [ ] **Step 4: Testy przechodzą**

Run: `npx vitest run src/server/library.test.ts`
Expected: PASS (w tym istniejący test „usunięcie pliku emituje removed" — przez nowy handler).

- [ ] **Step 5: Commit**

```bash
git add src/server/library.ts src/server/library.test.ts
git commit -m "feat: MediaLibrary.remove() — synchroniczne usunięcie z biblioteki"
```

---

### Task 3: `Radio.dropQueued()`

**Files:**
- Modify: `src/server/radio.ts`
- Test: `src/server/radio.test.ts`

**Interfaces:**
- Consumes: prywatną kolejkę `newMemQueue: MediaItem[]` (już istnieje).
- Produces: `Radio.dropQueued(file: string): void` — usuwa mem o tej nazwie z kolejki nowych memów (czekających za reklamą). Task 5 woła `radio.dropQueued(file)`.

- [ ] **Step 1: Napisz failujący test w `src/server/radio.test.ts`**

Dopisz w `describe('Radio: NOWY MEM', ...)`:

```ts
  test('dropQueued usuwa mem z kolejki nowych', async () => {
    const { radio, memes, states } = setup({
      memes: [img('a.jpg')],
      ads: [vid('r.mp4', 20_000)],
      config: { adInterval: 1 },
    });
    radio.start(); // mem a (10s) → reklama (20s)
    await vi.advanceTimersByTimeAsync(15_000); // w trakcie reklamy
    memes.add(img('q1.jpg'));
    memes.add(img('q2.jpg'));
    radio.dropQueued('q1.jpg');
    await vi.advanceTimersByTimeAsync(15_001); // koniec reklamy → q2 (q1 wypadł)
    expect(states.at(-1)!).toMatchObject({ newMem: true, item: { name: 'q2.jpg' } });
    radio.stop();
  });
```

- [ ] **Step 2: Sprawdź, że test failuje**

Run: `npx vitest run src/server/radio.test.ts`
Expected: FAIL — `radio.dropQueued is not a function`.

- [ ] **Step 3: Dodaj metodę w `src/server/radio.ts`**

Po metodzie `skip()`:

```ts
  dropQueued(file: string): void {
    this.newMemQueue = this.newMemQueue.filter((i) => i.file !== file);
  }
```

- [ ] **Step 4: Testy przechodzą**

Run: `npx vitest run src/server/radio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/radio.ts src/server/radio.test.ts
git commit -m "feat: Radio.dropQueued() — czyszczenie zgłoszonego mema z kolejki nowych"
```

---

### Task 4: `moveToTrash()` — przenoszenie do kosza

**Files:**
- Create: `src/server/trash.ts`
- Test: `src/server/trash.test.ts`

**Interfaces:**
- Produces: `moveToTrash(mediaDir: string, file: string): Promise<string>` — tworzy `MEDIA_DIR/trash` (recursive), przenosi `MEDIA_DIR/<file>` → `MEDIA_DIR/trash/<file>` (przy kolizji `MEDIA_DIR/trash/<Date.now()>-<file>`), zwraca ścieżkę docelową; reject gdy źródła nie ma. Task 5 woła tę funkcję.

- [ ] **Step 1: Napisz failujące testy — utwórz `src/server/trash.test.ts`**

```ts
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
```

- [ ] **Step 2: Sprawdź, że testy failują**

Run: `npx vitest run src/server/trash.test.ts`
Expected: FAIL — moduł `./trash` nie istnieje.

- [ ] **Step 3: Utwórz `src/server/trash.ts`**

```ts
import { mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Przenosi zgłoszonego mema do kosza; kolizja nazwy dostaje prefiks z timestampem,
// żeby niczego nie nadpisać.
export async function moveToTrash(mediaDir: string, file: string): Promise<string> {
  const trashDir = join(mediaDir, 'trash');
  await mkdir(trashDir, { recursive: true });
  let dest = join(trashDir, file);
  if (await exists(dest)) dest = join(trashDir, `${Date.now()}-${file}`);
  await rename(join(mediaDir, file), dest);
  return dest;
}
```

- [ ] **Step 4: Testy przechodzą**

Run: `npx vitest run src/server/trash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/trash.ts src/server/trash.test.ts
git commit -m "feat: moveToTrash — przenoszenie zgłoszonych memów do MEDIA_DIR/trash"
```

---

### Task 5: wiadomość `report` — typy + handler serwera

**Files:**
- Modify: `src/shared/types.ts` (REPORT_REASONS, ReportMessage)
- Modify: `src/server/app.ts` (handler)
- Test: `src/server/app.test.ts`

**Interfaces:**
- Consumes: `Radio.skip()` (Task 1), `MediaLibrary.remove()` (Task 2), `Radio.dropQueued()` (Task 3), `moveToTrash()` (Task 4).
- Produces: `REPORT_REASONS: readonly string[]` (as const) i `type ReportReason`, `interface ReportMessage { type: 'report'; file: string; reason: ReportReason }` w `ClientMessage` — Task 6 (panel) importuje `REPORT_REASONS` i wysyła `ReportMessage`.

- [ ] **Step 1: Dodaj typy w `src/shared/types.ts`**

Po definicji `RemoveTickerMessage` (linia 60):

```ts
export const REPORT_REASONS = [
  'To nie jest mem',
  'Jestem na tym zdjęciu i nie podoba mi się to',
  'Nie ma mnie na tym zdjęciu i nie podoba mi się to',
  'To jest mem Grzegorza',
  'Ten mem jest niezgodny z SOM',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export interface ReportMessage { type: 'report'; file: string; reason: ReportReason; }
```

Dopisz `| ReportMessage` do unii `ClientMessage`.

- [ ] **Step 2: Przygotuj helpery w `src/server/app.test.ts`**

Rozbij `beforeEach` (linie 15-28) na funkcję wielokrotnego użytku:

```ts
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
```

`beforeEach` zostaje: `dir = await mkdtemp(...); await startApp();`.
Rozszerz importy: `import { existsSync } from 'node:fs';` oraz `mkdir, readdir, writeFile` z `node:fs/promises`.

- [ ] **Step 3: Napisz failujące testy w `src/server/app.test.ts`**

Nowy `describe` na końcu pliku:

```ts
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
```

- [ ] **Step 4: Sprawdź, że testy failują**

Run: `npx vitest run src/server/app.test.ts`
Expected: FAIL — testy `report` (plik zostaje na miejscu, stan się nie zmienia); test `skip` przechodzi już po Task 1 — to ok.

- [ ] **Step 5: Dodaj handler w `src/server/app.ts`**

Importy: `REPORT_REASONS` z `../shared/types`, `moveToTrash` z `./trash`.

Nad `wss.on('connection', ...)` dodaj:

```ts
  const handleReport = async (file: string, reason: string): Promise<void> => {
    if (!memes.get(file)) return; // już zgłoszony / nieznany — ignorujemy
    try {
      await moveToTrash(config.mediaDir, file);
    } catch (err) {
      console.warn(`[report] nie udało się przenieść ${file} do kosza:`, err instanceof Error ? err.message : err);
      return;
    }
    memes.remove(file);
    radio.dropQueued(file);
    const { item } = radio.stateMessage();
    if ((item.kind === 'image' || item.kind === 'video') && item.name === file) radio.skip();
    console.log(`[report] „${file}" zgłoszony: ${reason}`);
  };
```

W dispatchu wiadomości (za gałęzią `removeTicker`):

```ts
      } else if (
        msg.type === 'report' &&
        typeof msg.file === 'string' &&
        (REPORT_REASONS as readonly string[]).includes(msg.reason)
      ) {
        void handleReport(msg.file, msg.reason);
```

- [ ] **Step 6: Testy i typy przechodzą**

Run: `npm test && npm run typecheck`
Expected: PASS wszędzie.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/server/app.ts src/server/app.test.ts
git commit -m "feat: wiadomość report — zgłoszony mem ląduje w koszu i wypada z rotacji"
```

---

### Task 6: panel — guziki „Zgłoś" i dialog powodów

**Files:**
- Modify: `src/client/index.html` (dialog)
- Modify: `src/client/panel/main.ts` (guziki + obsługa dialogu)
- Modify: `src/client/panel/style.css` (style dialogu i guzika)

**Interfaces:**
- Consumes: `REPORT_REASONS` i `ReportMessage` z `src/shared/types.ts` (Task 5); `conn.send()` (istniejące).
- Produces: tylko UI — nic dla kolejnych tasków.

- [ ] **Step 1: Dodaj dialog w `src/client/index.html`**

Przed `<div id="drop-overlay" hidden>`:

```html
  <dialog id="report-dialog">
    <h2>Zgłoś mema</h2>
    <p id="report-file"></p>
    <div id="report-reasons"></div>
    <button id="report-cancel" type="button">Anuluj</button>
  </dialog>
```

- [ ] **Step 2: Logika w `src/client/panel/main.ts`**

Do importu z `../../shared/types` dopisz `REPORT_REASONS`.

Po deklaracjach elementów (przy linii 13):

```ts
const reportDialog = $<HTMLDialogElement>('#report-dialog');
const reportFileEl = $('#report-file');
const reportReasons = $('#report-reasons');
const reportCancel = $<HTMLButtonElement>('#report-cancel');

let reportedFile = '';

for (const reason of REPORT_REASONS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = reason;
  btn.addEventListener('click', () => {
    conn.send({ type: 'report', file: reportedFile, reason });
    reportDialog.close();
  });
  reportReasons.append(btn);
}
reportCancel.addEventListener('click', () => reportDialog.close());

// Guzik „Zgłoś" tylko dla memów (image/video) — nie dla reklam i trybów specjalnych.
function reportButton(kind: ItemKind, name: string | undefined): HTMLButtonElement | null {
  if ((kind !== 'image' && kind !== 'video') || !name) return null;
  const btn = document.createElement('button');
  btn.className = 'report-btn';
  btn.textContent = 'Zgłoś';
  btn.addEventListener('click', () => {
    reportedFile = name;
    reportFileEl.textContent = name;
    reportDialog.showModal();
  });
  return btn;
}
```

W `renderNow()` — po `nowContent.append(meta);` dodaj:

```ts
    const rb = reportButton(item.kind, item.name);
    if (rb) nowContent.append(rb);
```

W `renderHistory()` — zamień `li.append(meta, time);` na:

```ts
      const rb = reportButton(e.kind, e.name);
      li.append(meta, time, ...(rb ? [rb] : []));
```

- [ ] **Step 3: Style w `src/client/panel/style.css`**

Na końcu pliku:

```css
.report-btn { background: #a53a3a; padding: 0.3rem 0.7rem; white-space: nowrap; }
#report-dialog { background: #1d1d28; color: #eee; border: 1px solid #444; border-radius: 0.75rem; padding: 1.25rem; max-width: 480px; margin: auto; }
#report-dialog::backdrop { background: rgba(0, 0, 0, 0.6); }
#report-file { color: #999; margin-bottom: 1rem; overflow-wrap: anywhere; }
#report-reasons { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
#report-reasons button { text-align: left; }
#report-cancel { background: #333; color: #ccc; }
```

- [ ] **Step 4: Build i typy przechodzą**

Run: `npm run build && npm run typecheck && npm test`
Expected: PASS wszędzie.

- [ ] **Step 5: Weryfikacja ręczna (smoke test)**

Run: `HA_TOKEN=t npm run dev` i otwórz `http://localhost:8080/`. Sprawdź (potrzebny min. 1 plik w `./media`):
- przy „Teraz gra" i wpisach historii typu mem/wideo jest guzik „Zgłoś" (brak przy reklamie/trybie specjalnym);
- klik otwiera dialog z nazwą pliku i 5 powodami; „Anuluj" i Esc zamykają bez efektu;
- klik powodu: mem znika z playera (skip), plik ląduje w `./media/trash/`, w konsoli serwera log z powodem;
- guzik „Skip" działa dla mema i jest nieaktywny tylko przy pustym `./media` (idle).

Zatrzymaj serwer po weryfikacji.

- [ ] **Step 6: Commit**

```bash
git add src/client/index.html src/client/panel/main.ts src/client/panel/style.css
git commit -m "feat: panel — zgłaszanie memów z wyborem powodu"
```

---

### Task 7: weryfikacja końcowa

**Files:** żadnych nowych — tylko weryfikacja.

- [ ] **Step 1: Pełny przebieg**

Run: `npm test && npm run typecheck && npm run build`
Expected: wszystkie testy PASS, zero błędów typów, build się udaje.

- [ ] **Step 2: Sprzątanie po `stopAd`**

Run: `grep -rn "stopAd\|stop-ad" src/`
Expected: brak wyników.

- [ ] **Step 3: Commit (tylko jeśli coś poprawiano)**

Jeśli weryfikacja wykryła poprawki — osobny commit `fix: ...` z opisem.
