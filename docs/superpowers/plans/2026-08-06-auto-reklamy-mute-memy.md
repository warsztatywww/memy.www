# Checkbox „Automatyczne reklamy” + wyciszenie filmów-memów — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serwerowy, trwały przełącznik automatycznych reklam sterowany checkboxem z panelu + filmy-memy odtwarzane bez dźwięku (reklamy nadal z audio).

**Architecture:** Flaga `autoAds` w `Radio` pomija gałąź automatycznych reklam w `advance()`; stan wraca do klientów nowym polem `autoAds` w `StateMessage`, panel wysyła nową wiadomość WS `setAutoAds`. Trwałość przez mini-store `SettingsStore` (`data/settings.json`) wzorem `TickerStore`. Wyciszenie memów to jedna linia w `showVideo()` odtwarzacza.

**Tech Stack:** Node.js + TypeScript (ESM), express, ws, vanilla TS klient budowany Vitem, testy vitest (fake timers w testach Radia).

**Spec:** `docs/superpowers/specs/2026-08-06-auto-reklamy-mute-memy-design.md`

## Global Constraints

- Praca bezpośrednio na gałęzi `master`, bez worktree i bez feature-brancha.
- UI, komentarze i komunikaty commitów po polsku, w stylu istniejącego kodu (krótkie `feat:`/`test:`).
- Vanilla TypeScript, bez nowych zależności.
- TDD: najpierw test, potem implementacja. Przed każdym commitem: `npm test` i `npm run typecheck` muszą przechodzić.
- Każdy commit kończy się linią: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Domyślna wartość ustawienia: `autoAds: true` (brak pliku / uszkodzony plik / złe typy → domyślna).

---

### Task 1: `SettingsStore` — trwały store ustawień

**Files:**
- Create: `src/server/settings.ts`
- Test: `src/server/settings.test.ts`

**Interfaces:**
- Consumes: nic (tylko `node:fs`, `node:path`).
- Produces: `class SettingsStore { constructor(filePath: string); get autoAds(): boolean; setAutoAds(enabled: boolean): void }`. Task 3 tworzy instancję i czyta/pisze przez te trzy elementy. Bez EventEmittera — broadcast idzie przez `Radio`.

- [ ] **Step 1: Napisz failujące testy**

Utwórz `src/server/settings.test.ts` (wzorzec katalogu tymczasowego jak w `src/server/ticker.test.ts`):

```typescript
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SettingsStore } from './settings';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memiarka-settings-'));
  file = join(dir, 'settings.json');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  test('brak pliku → domyślnie autoAds = true', () => {
    expect(new SettingsStore(file).autoAds).toBe(true);
  });

  test('setAutoAds zapisuje na dysk; nowa instancja wczytuje', () => {
    const store = new SettingsStore(file);
    store.setAutoAds(false);
    expect(store.autoAds).toBe(false);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ autoAds: false });
    expect(new SettingsStore(file).autoAds).toBe(false);
  });

  test('uszkodzony plik → domyślne wartości, bez wyjątku', () => {
    writeFileSync(file, 'to nie json{{{');
    expect(new SettingsStore(file).autoAds).toBe(true);
  });

  test('autoAds w pliku nie-boolean → domyślne true', () => {
    writeFileSync(file, JSON.stringify({ autoAds: 'nie' }));
    expect(new SettingsStore(file).autoAds).toBe(true);
  });

  test('brak katalogu → tworzony przy zapisie', () => {
    const nested = join(dir, 'nie-ma', 'settings.json');
    new SettingsStore(nested).setAutoAds(false);
    expect(new SettingsStore(nested).autoAds).toBe(false);
  });

  test('setAutoAds z tą samą wartością nie dotyka pliku', () => {
    const store = new SettingsStore(file);
    store.setAutoAds(true); // wartość domyślna — nic się nie zmienia
    expect(() => readFileSync(file, 'utf8')).toThrow(); // plik nie powstał
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npx vitest run src/server/settings.test.ts`
Expected: FAIL — moduł `./settings` nie istnieje.

- [ ] **Step 3: Minimalna implementacja**

Utwórz `src/server/settings.ts` (wzorem `TickerStore` w `src/server/ticker.ts` — konstruktor łyka `ENOENT`, `persist()` tworzy katalog):

```typescript
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface Settings {
  autoAds: boolean;
}

const DEFAULTS: Settings = { autoAds: true };

export class SettingsStore {
  private settings: Settings = { ...DEFAULTS };

  constructor(private filePath: string) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<Settings> | null;
      if (typeof raw?.autoAds === 'boolean') this.settings.autoAds = raw.autoAds;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[settings] nie udało się wczytać ${filePath}:`, err);
      }
    }
  }

  get autoAds(): boolean {
    return this.settings.autoAds;
  }

  setAutoAds(enabled: boolean): void {
    if (this.settings.autoAds === enabled) return;
    this.settings.autoAds = enabled;
    this.persist();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2));
    } catch (err) {
      console.warn(`[settings] nie udało się zapisać ${this.filePath}:`, err);
    }
  }
}
```

- [ ] **Step 4: Uruchom testy — mają przechodzić**

Run: `npx vitest run src/server/settings.test.ts`
Expected: PASS (6 testów).

- [ ] **Step 5: Pełny test + typecheck + commit**

Run: `npm test && npm run typecheck`
Expected: wszystko zielone.

```bash
git add src/server/settings.ts src/server/settings.test.ts
git commit -m "feat: SettingsStore — trwałe ustawienia w data/settings.json

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `Radio.autoAds` + pole `autoAds` w `StateMessage`

**Files:**
- Modify: `src/shared/types.ts` (interfejs `StateMessage`)
- Modify: `src/server/radio.ts`
- Modify: `src/client/player/main.ts` (tylko fake state trybu podglądu — wymóg typu)
- Test: `src/server/radio.test.ts`

**Interfaces:**
- Consumes: nic nowego.
- Produces:
  - `StateMessage.autoAds: boolean` (pole wymagane, obok `adsAvailable`),
  - `RadioDeps.autoAds?: boolean` (wartość początkowa, domyślnie `true`),
  - `Radio.setAutoAds(enabled: boolean): void` — zmiana wartości ustawia flagę i emituje `'update'`; ta sama wartość → no-op bez emisji.
  - Semantyka: przy wyłączonym automacie `advance()` pomija gałąź reklam, ale licznik `memesSinceAd` dalej rośnie; grająca reklama nie jest przerywana; `playAdNow()` działa niezależnie od flagi.

- [ ] **Step 1: Napisz failujące testy**

W `src/server/radio.test.ts`:

1. W funkcji `setup()` dodaj do parametru `opts` pole `autoAds?: boolean` i przekaż je do konstruktora `Radio`:

```typescript
function setup(opts: {
  memes?: MediaItem[];
  ads?: MediaItem[];
  specials?: SpecialSlot[];
  getSpecialData?: (id: string) => unknown;
  config?: Partial<RadioConfig>;
  autoAds?: boolean;
} = {}) {
  const memes = new FakeSource(opts.memes ?? []);
  const ads = new FakeSource(opts.ads ?? []);
  const radio = new Radio({
    memes,
    ads,
    specials: opts.specials ?? [],
    getSpecialData: opts.getSpecialData ?? ((id) => ({ d: id })),
    config: { ...CONFIG, ...opts.config },
    rng: mulberry32(42),
    autoAds: opts.autoAds,
  });
  const states: StateMessage[] = [];
  radio.on('update', () => states.push(radio.stateMessage()));
  return { radio, memes, ads, states };
}
```

2. Dodaj na końcu pliku nowy blok `describe`:

```typescript
describe('Radio: automatyczne reklamy (autoAds)', () => {
  test('stateMessage zawiera autoAds, domyślnie true', () => {
    const { radio } = setup({ memes: [img('a.jpg')] });
    radio.start();
    expect(radio.stateMessage().autoAds).toBe(true);
    radio.stop();
  });

  test('wyłączony automat: same memy mimo przekroczenia adInterval', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg'), img('b.jpg'), img('c.jpg'), img('d.jpg')],
      ads: [vid('r.mp4', 5_000)],
      autoAds: false,
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(80_000); // adInterval=3 dawno przekroczony
    expect(states.every((s) => s.item.kind === 'image')).toBe(true);
    radio.stop();
  });

  test('ponowne włączenie → reklama w najbliższym slocie (licznik rósł)', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg'), img('b.jpg'), img('c.jpg'), img('d.jpg')],
      ads: [vid('r.mp4', 5_000)],
      autoAds: false,
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(40_000); // 5 memów, memesSinceAd >= 3
    radio.setAutoAds(true);
    await vi.advanceTimersByTimeAsync(10_001); // koniec bieżącego mema → slot
    expect(states.at(-1)!.item.kind).toBe('ad');
    radio.stop();
  });

  test('setAutoAds emituje update przy zmianie; ta sama wartość = no-op', () => {
    const { radio, states } = setup({ memes: [img('a.jpg')] });
    radio.start();
    const count = states.length;
    radio.setAutoAds(false);
    expect(states.length).toBe(count + 1);
    expect(states.at(-1)!.autoAds).toBe(false);
    radio.setAutoAds(false);
    expect(states.length).toBe(count + 1);
    radio.stop();
  });

  test('wyłączenie w trakcie grającej reklamy nie przerywa jej', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg')],
      ads: [vid('r.mp4', 20_000)],
      config: { adInterval: 1 },
    });
    radio.start(); // mem (10s) → reklama (20s)
    await vi.advanceTimersByTimeAsync(15_000);
    expect(states.at(-1)!.item.kind).toBe('ad');
    const { startedAt } = states.at(-1)!;
    radio.setAutoAds(false);
    expect(states.at(-1)!.item.kind).toBe('ad'); // nadal gra ta sama reklama
    expect(states.at(-1)!.startedAt).toBe(startedAt);
    radio.stop();
  });

  test('playAdNow działa przy wyłączonym automacie', () => {
    const { radio, states } = setup({
      memes: [img('a.jpg')],
      ads: [vid('r.mp4', 5_000)],
      autoAds: false,
      config: { adInterval: 99 },
    });
    radio.start();
    radio.playAdNow();
    expect(states.at(-1)!.item).toMatchObject({ kind: 'ad', url: '/ads/r.mp4' });
    radio.stop();
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npx vitest run src/server/radio.test.ts`
Expected: FAIL — `Radio` nie ma `setAutoAds`, `stateMessage()` nie ma `autoAds` (błędy kompilacji/asercji).

- [ ] **Step 3: Implementacja**

W `src/shared/types.ts` dodaj pole do `StateMessage` (po `adsAvailable`):

```typescript
export interface StateMessage {
  type: 'state';
  item: StateItem;
  startedAt: number; // epoch ms serwera
  duration: number; // ms; 0 dla idle
  newMem: boolean;
  serverNow: number;
  adsAvailable: boolean;
  autoAds: boolean;
}
```

W `src/server/radio.ts`:

1. W `RadioDeps` dodaj pole `autoAds?: boolean;` (po `rng?`).
2. W klasie `Radio` dodaj pole prywatne i inicjalizację w konstruktorze:

```typescript
private autoAds: boolean;
```

```typescript
this.autoAds = deps.autoAds ?? true;
```

3. W `stateMessage()` dodaj pole:

```typescript
stateMessage(): StateMessage {
  return {
    type: 'state',
    ...this.current,
    serverNow: Date.now(),
    adsAvailable: this.adBag.size > 0,
    autoAds: this.autoAds,
  };
}
```

4. Dodaj metodę publiczną (obok `playAdNow`/`skip`):

```typescript
setAutoAds(enabled: boolean): void {
  if (this.autoAds === enabled) return;
  this.autoAds = enabled;
  this.emit('update');
}
```

5. W `advance()` dołóż warunek do gałęzi reklam (licznik `memesSinceAd` celowo rośnie dalej — po włączeniu reklama wchodzi w najbliższym slocie):

```typescript
if (this.autoAds && this.memesSinceAd >= this.config.adInterval) {
  const ad = this.nextAd();
  if (ad) return this.playMedia(ad, { ad: true });
}
```

W `src/client/player/main.ts` w bloku `if (preview)` uzupełnij `fakeState` o nowe wymagane pole:

```typescript
      adsAvailable: false,
      autoAds: true,
```

- [ ] **Step 4: Uruchom testy — mają przechodzić**

Run: `npx vitest run src/server/radio.test.ts`
Expected: PASS (w tym 6 nowych testów).

- [ ] **Step 5: Pełny test + typecheck + commit**

Run: `npm test && npm run typecheck`
Expected: zielone. Uwaga: `src/server/app.ts` nie wymaga zmian na tym etapie — `autoAds` w depsach jest opcjonalne.

```bash
git add src/shared/types.ts src/server/radio.ts src/server/radio.test.ts src/client/player/main.ts
git commit -m "feat: Radio.setAutoAds — przełącznik automatycznych reklam w rotacji

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Wiadomość WS `setAutoAds` + spięcie w `app.ts`

**Files:**
- Modify: `src/shared/types.ts` (nowy typ wiadomości klienta)
- Modify: `src/server/app.ts`
- Test: `src/server/app.test.ts`

**Interfaces:**
- Consumes: `SettingsStore` z Task 1 (`new SettingsStore(join(config.dataDir, 'settings.json'))`, `get autoAds`, `setAutoAds(enabled)`); `Radio.setAutoAds(enabled)` i `RadioDeps.autoAds` z Task 2.
- Produces: `SetAutoAdsMessage { type: 'setAutoAds'; enabled: boolean }` w unii `ClientMessage` — Task 4 (panel) wysyła dokładnie ten kształt.

- [ ] **Step 1: Napisz failujące testy**

W `src/server/app.test.ts` dodaj nowy blok `describe` na końcu pliku (korzysta z istniejących helperów `openWs`, `wait`, `startApp` i zmiennych `app`/`dir`):

```typescript
describe('app: automatyczne reklamy', () => {
  test('state zawiera autoAds=true; setAutoAds po WS broadcastuje nową wartość', async () => {
    const { ws, messages } = await openWs();
    await wait(100);
    const first = messages.find((m) => m.type === 'state');
    if (first?.type !== 'state') throw new Error('brak state');
    expect(first.autoAds).toBe(true);
    ws.send(JSON.stringify({ type: 'setAutoAds', enabled: false }));
    await wait(200);
    const last = messages.filter((m) => m.type === 'state').at(-1);
    if (last?.type !== 'state') throw new Error('brak state');
    expect(last.autoAds).toBe(false);
    ws.close();
  });

  test('setAutoAds z enabled nie-boolean jest ignorowany', async () => {
    const { ws } = await openWs();
    await wait(100);
    ws.send(JSON.stringify({ type: 'setAutoAds', enabled: 'nie' }));
    await wait(200);
    const { ws: ws2, messages: m2 } = await openWs();
    await wait(200);
    const state = m2.find((m) => m.type === 'state');
    if (state?.type !== 'state') throw new Error('brak state');
    expect(state.autoAds).toBe(true);
    ws.close();
    ws2.close();
  });

  test('autoAds=false przeżywa restart serwera (data/settings.json)', async () => {
    const { ws } = await openWs();
    await wait(100);
    ws.send(JSON.stringify({ type: 'setAutoAds', enabled: false }));
    await wait(200);
    ws.close();
    await app.stop();
    await startApp(); // ten sam katalog `dir` → ten sam data/settings.json
    const { ws: ws2, messages: m2 } = await openWs();
    await wait(200);
    const state = m2.find((m) => m.type === 'state');
    if (state?.type !== 'state') throw new Error('brak state');
    expect(state.autoAds).toBe(false);
    ws2.close();
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npx vitest run src/server/app.test.ts`
Expected: FAIL — `setAutoAds` nieobsłużone (broadcast się nie dzieje, restart wraca do `true`).

- [ ] **Step 3: Implementacja**

W `src/shared/types.ts` dodaj typ wiadomości (obok `SkipMessage`) i rozszerz unię:

```typescript
export interface SetAutoAdsMessage { type: 'setAutoAds'; enabled: boolean; }
```

```typescript
export type ClientMessage =
  | PingMessage
  | PlayAdMessage
  | SkipMessage
  | SetAutoAdsMessage
  | AddTickerMessage
  | RemoveTickerMessage
  | ReportMessage;
```

W `src/server/app.ts`:

1. Import: `import { SettingsStore } from './settings';`
2. Po utworzeniu `ticker` dodaj store i przekaż wartość początkową do `Radio`:

```typescript
const settings = new SettingsStore(join(config.dataDir, 'settings.json'));
```

W depsach `new Radio({ ... })` dodaj pole:

```typescript
    autoAds: settings.autoAds,
```

3. W handlerze wiadomości WS dodaj gałąź (po `skip`):

```typescript
      } else if (msg.type === 'setAutoAds' && typeof msg.enabled === 'boolean') {
        settings.setAutoAds(msg.enabled);
        radio.setAutoAds(msg.enabled);
```

Broadcast nowego stanu idzie istniejącą ścieżką `radio.emit('update')`.

- [ ] **Step 4: Uruchom testy — mają przechodzić**

Run: `npx vitest run src/server/app.test.ts`
Expected: PASS (3 nowe testy).

- [ ] **Step 5: Pełny test + typecheck + commit**

Run: `npm test && npm run typecheck`
Expected: zielone.

```bash
git add src/shared/types.ts src/server/app.ts src/server/app.test.ts
git commit -m "feat: wiadomość setAutoAds — przełącznik reklam trwały w data/settings.json

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Checkbox „Automatyczne reklamy” w panelu

**Files:**
- Modify: `src/client/index.html`
- Modify: `src/client/panel/main.ts`
- Modify: `src/client/panel/style.css`

**Interfaces:**
- Consumes: `StateMessage.autoAds` (Task 2), `SetAutoAdsMessage` (Task 3), istniejące `conn.send()` z `src/client/lib/connection.ts`.
- Produces: element `#auto-ads` (checkbox) — nic dalej z tego nie korzysta.

Klient nie ma testów jednostkowych (zgodnie ze specem) — weryfikacja przez typecheck, build i sprawdzenie ręczne na końcu.

- [ ] **Step 1: HTML — checkbox obok guzików reklam**

W `src/client/index.html` w sekcji `#now-playing` rozszerz `div.buttons`:

```html
    <div class="buttons">
      <button id="play-ad" disabled>Odtwórz reklamę teraz</button>
      <button id="skip" disabled>Skip</button>
      <label class="auto-ads"><input id="auto-ads" type="checkbox" checked> Automatyczne reklamy</label>
    </div>
```

- [ ] **Step 2: Logika w panelu**

W `src/client/panel/main.ts`:

1. Po deklaracji `skipBtn` dodaj:

```typescript
const autoAdsBox = $<HTMLInputElement>('#auto-ads');
```

2. Po listenerze `skipBtn` dodaj:

```typescript
autoAdsBox.addEventListener('change', () => conn.send({ type: 'setAutoAds', enabled: autoAdsBox.checked }));
```

3. W `renderNow()` obok `playAdBtn.disabled = ...` dodaj (stan z serwera — wszystkie panele widzą to samo, bez localStorage):

```typescript
  autoAdsBox.checked = state.autoAds;
```

- [ ] **Step 3: Styl**

Na końcu `src/client/panel/style.css` dodaj:

```css
.auto-ads {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  user-select: none;
  cursor: pointer;
}
```

- [ ] **Step 4: Weryfikacja**

Run: `npm test && npm run typecheck && npm run build`
Expected: wszystko zielone, build przechodzi.

- [ ] **Step 5: Commit**

```bash
git add src/client/index.html src/client/panel/main.ts src/client/panel/style.css
git commit -m "feat: panel — checkbox „Automatyczne reklamy” sterujący rotacją

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Odtwarzacz — filmy-memy bez dźwięku

**Files:**
- Modify: `src/client/player/main.ts`

**Interfaces:**
- Consumes: `StateMessage.item.kind` (istniejące).
- Produces: nic — zmiana zachowania elementu `<video>`.

- [ ] **Step 1: Wyciszenie w `showVideo()`**

W `src/client/player/main.ts` w funkcji `showVideo()`, przed `video.src = state.item.url!;`, dodaj:

```typescript
  // filmy-memy grają bez dźwięku; audio mają tylko reklamy
  video.muted = state.item.kind !== 'ad';
```

- [ ] **Step 2: Weryfikacja**

Run: `npm test && npm run typecheck && npm run build`
Expected: zielone.

- [ ] **Step 3: Commit**

```bash
git add src/client/player/main.ts
git commit -m "feat: player — filmy-memy wyciszone, dźwięk tylko dla reklam

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Weryfikacja ręczna (po wszystkich taskach)

1. `npm run dev`, otwórz panel (`/`) i odtwarzacz (`/player`, kliknij „▶ START”).
2. Wrzuć film-mem do `media/` → gra bez dźwięku; „Odtwórz reklamę teraz” → reklama z dźwiękiem.
3. Odznacz „Automatyczne reklamy” → po `AD_INTERVAL` memów reklama nie wchodzi; guzik ręczny nadal działa; drugi otwarty panel pokazuje odznaczony checkbox.
4. Restart serwera → checkbox nadal odznaczony (`data/settings.json`).
