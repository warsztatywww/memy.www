# Paski informacyjne w playerze — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Player dostaje górny pasek (przewijany ticker zarządzany z panelu, trwały w `./data/ticker.json`) i dolny pasek (zapasy po lewej, prysznice po prawej, polling serwerowy co 5 s, push po WS).

**Architecture:** Nowy `StatusPoller` na serwerze odpytuje istniejące moduły specials (pantry, showers) co `STATUS_INTERVAL` i broadcastuje `status` przy zmianie; `TickerStore` trzyma i persystuje komunikaty, panel zarządza nimi wiadomościami `addTicker`/`removeTicker`. Radio przestaje samo fetchować dane specials — bierze snapshot z pollera. Wszystko idzie istniejącym WebSocketem `/ws`.

**Tech Stack:** Node 22 + TypeScript (ESM, strict), Express 5, ws, Vite (front bez frameworka), vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-player-bars-design.md`

## Global Constraints

- Cała treść UI, komentarze i komunikaty commitów po polsku; commity w stylu conventional (`feat:`, `fix:`, `docs:`), jak w historii repo.
- Komendy: testy `npm test` (vitest run), pojedynczy plik `npx vitest run <plik>`, typy `npm run typecheck`, build `npm run build`.
- TDD: najpierw test, potem implementacja. Front (player/panel) bez testów jednostkowych — weryfikacja ręczna, jak dotąd w repo.
- Nowe env: `STATUS_INTERVAL` (sekundy, domyślnie `5`), `DATA_DIR` (domyślnie `./data`).
- Limit tekstu komunikatu tickera: 500 znaków; pusty/białe znaki — ignorowany.
- Żadnych nowych zależności npm.

---

### Task 1: Konfiguracja — `STATUS_INTERVAL` i `DATA_DIR`

**Files:**
- Modify: `src/server/config.ts`
- Test: `src/server/config.test.ts`

**Interfaces:**
- Produces: `Config.statusIntervalMs: number` (ms), `Config.dataDir: string` (ścieżka absolutna) — używane w Tasku 6.

- [ ] **Step 1: Napisz failujący test**

Dopisz na końcu `src/server/config.test.ts` (zachowaj istniejące importy — `loadConfig` już jest importowany; dodaj `resolve` z `node:path`, jeśli go nie ma):

```ts
describe('status i dane trwałe', () => {
  test('domyślne statusIntervalMs=5000 i dataDir=./data', () => {
    const c = loadConfig({ HA_TOKEN: 't' });
    expect(c.statusIntervalMs).toBe(5000);
    expect(c.dataDir).toBe(resolve('./data'));
  });

  test('STATUS_INTERVAL i DATA_DIR z env', () => {
    const c = loadConfig({ HA_TOKEN: 't', STATUS_INTERVAL: '10', DATA_DIR: '/tmp/memiarka-dane' });
    expect(c.statusIntervalMs).toBe(10_000);
    expect(c.dataDir).toBe('/tmp/memiarka-dane');
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npx vitest run src/server/config.test.ts`
Expected: FAIL — `statusIntervalMs`/`dataDir` nie istnieją w `Config`.

- [ ] **Step 3: Implementacja**

W `src/server/config.ts` dodaj do interfejsu `Config`:

```ts
  statusIntervalMs: number;
  dataDir: string;
```

i do obiektu zwracanego z `loadConfig` (obok istniejących pól):

```ts
    statusIntervalMs: num(env.STATUS_INTERVAL, 5) * 1000,
    dataDir: resolve(env.DATA_DIR ?? './data'),
```

- [ ] **Step 4: Testy przechodzą**

Run: `npx vitest run src/server/config.test.ts`
Expected: PASS (wszystkie, także dotychczasowe).

- [ ] **Step 5: Commit**

```bash
git add src/server/config.ts src/server/config.test.ts
git commit -m "feat: konfiguracja STATUS_INTERVAL i DATA_DIR"
```

---

### Task 2: Typy protokołu WS + poszerzenie `connection.ts`

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/client/lib/connection.ts`

**Interfaces:**
- Produces (używane w Taskach 3–8):

```ts
export interface TickerItem { id: string; text: string; }
export interface StatusMessage { type: 'status'; pantry: PantryData; showers: ShowersData; }
export interface TickerMessage { type: 'ticker'; messages: TickerItem[]; }
export interface AddTickerMessage { type: 'addTicker'; text: string; }
export interface RemoveTickerMessage { type: 'removeTicker'; id: string; }
```

- [ ] **Step 1: Rozszerz `src/shared/types.ts`**

Nad linią `export type ServerMessage = ...` dodaj:

```ts
export interface TickerItem { id: string; text: string; }

export interface StatusMessage {
  type: 'status';
  pantry: PantryData;
  showers: ShowersData;
}

export interface TickerMessage {
  type: 'ticker';
  messages: TickerItem[];
}
```

Podmień unie:

```ts
export type ServerMessage = StateMessage | HistoryMessage | PongMessage | StatusMessage | TickerMessage;
```

Pod `StopAdMessage` dodaj i podmień `ClientMessage`:

```ts
export interface AddTickerMessage { type: 'addTicker'; text: string; }
export interface RemoveTickerMessage { type: 'removeTicker'; id: string; }
export type ClientMessage =
  | PingMessage
  | PlayAdMessage
  | StopAdMessage
  | AddTickerMessage
  | RemoveTickerMessage;
```

(`PantryData`/`ShowersData` są zdefiniowane niżej w tym samym pliku — interfejsy TS są hoistowane, kolejność bez znaczenia.)

- [ ] **Step 2: Poszerz callback w `src/client/lib/connection.ts`**

Podmień import typów i sygnaturę `connect` — klient ma dostawać wszystkie wiadomości poza `pong`:

```ts
import type { ClientMessage, PongMessage, ServerMessage } from '../../shared/types';
```

```ts
export type IncomingMessage = Exclude<ServerMessage, PongMessage>;

export function connect(onMessage: (msg: IncomingMessage) => void): Connection {
```

Ciało bez zmian — istniejące `if (msg.type === 'pong') ... else onMessage(msg)` zawęża typ poprawnie.

- [ ] **Step 3: Weryfikacja typów i testów**

Run: `npm run typecheck && npm test`
Expected: PASS — zmiany są czysto addytywne.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/client/lib/connection.ts
git commit -m "feat: typy WS dla tickera i statusu zapasów/pryszniców"
```

---

### Task 3: `TickerStore` — lista komunikatów z persystencją

**Files:**
- Create: `src/server/ticker.ts`
- Test: `src/server/ticker.test.ts`

**Interfaces:**
- Consumes: `TickerItem` z `src/shared/types.ts` (Task 2).
- Produces (używane w Tasku 6):

```ts
export class TickerStore extends EventEmitter {
  constructor(filePath: string);       // wczytuje plik synchronicznie
  messages(): TickerItem[];            // kopia listy
  add(text: string): void;             // trim, limit 500, pusty ignorowany; emituje 'update'
  remove(id: string): void;            // nieznane id = no-op bez emitu; emituje 'update'
}
```

- [ ] **Step 1: Napisz failujące testy**

Utwórz `src/server/ticker.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { TickerStore } from './ticker';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memiarka-ticker-'));
  file = join(dir, 'ticker.json');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('TickerStore', () => {
  test('add nadaje id, emituje update, remove usuwa', () => {
    const store = new TickerStore(file);
    let updates = 0;
    store.on('update', () => updates++);
    store.add('Pierwszy komunikat');
    store.add('Drugi');
    expect(updates).toBe(2);
    const msgs = store.messages();
    expect(msgs.map((m) => m.text)).toEqual(['Pierwszy komunikat', 'Drugi']);
    expect(new Set(msgs.map((m) => m.id)).size).toBe(2);
    store.remove(msgs[0].id);
    expect(updates).toBe(3);
    expect(store.messages().map((m) => m.text)).toEqual(['Drugi']);
  });

  test('pusty/białe znaki ignorowane, tekst przycinany do 500 znaków', () => {
    const store = new TickerStore(file);
    let updates = 0;
    store.on('update', () => updates++);
    store.add('   ');
    store.add('');
    expect(updates).toBe(0);
    store.add('  x'.padEnd(600, 'y'));
    expect(store.messages()[0].text.length).toBeLessThanOrEqual(500);
  });

  test('remove nieznanego id = no-op bez emitu', () => {
    const store = new TickerStore(file);
    store.add('a');
    let updates = 0;
    store.on('update', () => updates++);
    store.remove('nie-ma-takiego');
    expect(updates).toBe(0);
    expect(store.messages()).toHaveLength(1);
  });

  test('persystencja: nowa instancja wczytuje zapisane komunikaty', () => {
    const store = new TickerStore(file);
    store.add('przetrwam restart');
    const again = new TickerStore(file);
    expect(again.messages().map((m) => m.text)).toEqual(['przetrwam restart']);
    // plik jest poprawnym JSON-em
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
  });

  test('uszkodzony plik → pusta lista, bez wyjątku', () => {
    writeFileSync(file, 'to nie json{{{');
    const store = new TickerStore(file);
    expect(store.messages()).toEqual([]);
  });

  test('brak pliku → pusta lista', () => {
    const store = new TickerStore(join(dir, 'nie-istnieje', 'ticker.json'));
    expect(store.messages()).toEqual([]);
    store.add('tworzy katalog przy zapisie');
    const again = new TickerStore(join(dir, 'nie-istnieje', 'ticker.json'));
    expect(again.messages()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npx vitest run src/server/ticker.test.ts`
Expected: FAIL — moduł `./ticker` nie istnieje.

- [ ] **Step 3: Implementacja**

Utwórz `src/server/ticker.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TickerItem } from '../shared/types';

const MAX_TEXT_LENGTH = 500;

export class TickerStore extends EventEmitter {
  private items: TickerItem[] = [];

  constructor(private filePath: string) {
    super();
    try {
      const raw: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
      if (Array.isArray(raw)) {
        this.items = raw.filter(
          (i): i is TickerItem => typeof i?.id === 'string' && typeof i?.text === 'string',
        );
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[ticker] nie udało się wczytać ${filePath}:`, err);
      }
    }
  }

  messages(): TickerItem[] {
    return [...this.items];
  }

  add(text: string): void {
    const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!trimmed) return;
    this.items.push({ id: randomUUID(), text: trimmed });
    this.persist();
    this.emit('update');
  }

  remove(id: string): void {
    const next = this.items.filter((i) => i.id !== id);
    if (next.length === this.items.length) return;
    this.items = next;
    this.persist();
    this.emit('update');
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.items, null, 2));
    } catch (err) {
      console.warn(`[ticker] nie udało się zapisać ${this.filePath}:`, err);
    }
  }
}
```

- [ ] **Step 4: Testy przechodzą**

Run: `npx vitest run src/server/ticker.test.ts`
Expected: PASS (6 testów).

- [ ] **Step 5: Commit**

```bash
git add src/server/ticker.ts src/server/ticker.test.ts
git commit -m "feat: TickerStore — komunikaty paska z persystencją w JSON"
```

---

### Task 4: `StatusPoller` — cykliczne pobieranie danych specials

**Files:**
- Create: `src/server/status-poller.ts`
- Test: `src/server/status-poller.test.ts`

**Interfaces:**
- Consumes: `SpecialMode` z `src/server/specials/index.ts` (istniejący: `{ id, duration, fetchData(): Promise<unknown> }`).
- Produces (używane w Taskach 5 i 6):

```ts
export class StatusPoller extends EventEmitter {
  constructor(specials: SpecialMode[], intervalMs: number);
  start(): void;                 // natychmiastowy pierwszy tick + setInterval
  stop(): void;
  getData(id: string): unknown;  // ostatni snapshot albo null
}
// event 'update' — tylko gdy którykolwiek snapshot się zmienił
```

- [ ] **Step 1: Napisz failujące testy**

Utwórz `src/server/status-poller.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SpecialMode } from './specials/index';
import { StatusPoller } from './status-poller';

const mode = (id: string, fetchData: () => Promise<unknown>): SpecialMode => ({
  id,
  duration: 15_000,
  fetchData,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('StatusPoller', () => {
  test('pierwszy tick od razu po start(), getData zwraca snapshot, emit update', async () => {
    const poller = new StatusPoller([mode('a', async () => ({ v: 1 }))], 5000);
    let updates = 0;
    poller.on('update', () => updates++);
    expect(poller.getData('a')).toBeNull(); // przed pierwszym tickiem
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.getData('a')).toEqual({ v: 1 });
    expect(updates).toBe(1);
    poller.stop();
  });

  test('bez emitu gdy dane bez zmian; emit przy zmianie', async () => {
    let v = 1;
    const poller = new StatusPoller([mode('a', async () => ({ v }))], 5000);
    let updates = 0;
    poller.on('update', () => updates++);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toBe(1);
    await vi.advanceTimersByTimeAsync(5000); // te same dane
    expect(updates).toBe(1);
    v = 2;
    await vi.advanceTimersByTimeAsync(5000);
    expect(updates).toBe(2);
    expect(poller.getData('a')).toEqual({ v: 2 });
    poller.stop();
  });

  test('wyjątek z fetchData nie zatrzymuje pollingu, stary snapshot zostaje', async () => {
    let fail = false;
    let v = 1;
    const poller = new StatusPoller(
      [mode('a', async () => { if (fail) throw new Error('awaria'); return { v }; })],
      5000,
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(poller.getData('a')).toEqual({ v: 1 }); // stary snapshot
    fail = false;
    v = 3;
    await vi.advanceTimersByTimeAsync(5000);
    expect(poller.getData('a')).toEqual({ v: 3 }); // polling żyje
    poller.stop();
  });

  test('polluje wiele specials naraz; getData nieznanego id → null', async () => {
    const poller = new StatusPoller(
      [mode('a', async () => 'A'), mode('b', async () => 'B')],
      5000,
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.getData('a')).toBe('A');
    expect(poller.getData('b')).toBe('B');
    expect(poller.getData('nope')).toBeNull();
    poller.stop();
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npx vitest run src/server/status-poller.test.ts`
Expected: FAIL — moduł `./status-poller` nie istnieje.

- [ ] **Step 3: Implementacja**

Utwórz `src/server/status-poller.ts`:

```ts
import { EventEmitter } from 'node:events';
import type { SpecialMode } from './specials/index';

export class StatusPoller extends EventEmitter {
  private data = new Map<string, unknown>();
  private lastSerialized = '';
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(
    private specials: SpecialMode[],
    private intervalMs: number,
  ) {
    super();
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  getData(id: string): unknown {
    return this.data.get(id) ?? null;
  }

  private async tick(): Promise<void> {
    if (this.ticking) return; // poprzedni tick jeszcze trwa
    this.ticking = true;
    await Promise.all(
      this.specials.map(async (s) => {
        try {
          this.data.set(s.id, await s.fetchData());
        } catch {
          // snapshot bez zmian — fetchData specials i tak łyka błędy sieci
        }
      }),
    );
    this.ticking = false;
    const serialized = JSON.stringify([...this.data.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    if (serialized !== this.lastSerialized) {
      this.lastSerialized = serialized;
      this.emit('update');
    }
  }
}
```

- [ ] **Step 4: Testy przechodzą**

Run: `npx vitest run src/server/status-poller.test.ts`
Expected: PASS (4 testy).

- [ ] **Step 5: Commit**

```bash
git add src/server/status-poller.ts src/server/status-poller.test.ts
git commit -m "feat: StatusPoller — cykliczny snapshot danych specials"
```

---

### Task 5: Radio bierze dane specials ze snapshotu (`getSpecialData`)

**Files:**
- Modify: `src/server/radio.ts`
- Test: `src/server/radio.test.ts`

**Interfaces:**
- Produces (używane w Tasku 6):

```ts
export interface SpecialSlot { id: string; duration: number; } // ms
// RadioDeps: specials: SpecialSlot[]; getSpecialData: (id: string) => unknown;
// getSpecialData zwraca null → slajd pominięty w tej rundzie (radio gra dalej memy)
```

- [ ] **Step 1: Zaktualizuj testy (failujące)**

W `src/server/radio.test.ts`:

1. Zmień import: usuń `import type { SpecialMode } from './specials/index';`, dodaj `SpecialSlot` z `./radio`:

```ts
import { Radio, type RadioConfig, type SpecialSlot } from './radio';
```

2. W `setup()` dodaj opcję i przekaż do konstruktora:

```ts
function setup(opts: {
  memes?: MediaItem[];
  ads?: MediaItem[];
  specials?: SpecialSlot[];
  getSpecialData?: (id: string) => unknown;
  config?: Partial<RadioConfig>;
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
  });
  const states: StateMessage[] = [];
  radio.on('update', () => states.push(radio.stateMessage()));
  return { radio, memes, ads, states };
}
```

3. Zastąp cały blok `describe('Radio: tryby specjalne', ...)`:

```ts
describe('Radio: tryby specjalne', () => {
  const slot = (id: string): SpecialSlot => ({ id, duration: 15_000 });

  test('tryb wchodzi po interwale, po zakończeniu bieżącego elementu (bez preempcji)', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg'), img('b.jpg')],
      specials: [slot('pantry')],
      config: { adInterval: 99, specialIntervalMs: 25_000 },
    });
    radio.start(); // t=0: mem1 (10s), mem2 (10s), mem3 (10s) — interwał mija w t=25s, w trakcie mem3
    await vi.advanceTimersByTimeAsync(29_000);
    expect(states.at(-1)!.item.kind).toBe('image'); // mem3 się nie przerwał
    await vi.advanceTimersByTimeAsync(1_500); // t=30.5s: mem3 skończony → special
    const last = states.at(-1)!;
    expect(last.item.kind).toBe('special');
    expect(last.item.specialId).toBe('pantry');
    expect(last.item.data).toEqual({ d: 'pantry' }); // snapshot z getSpecialData
    expect(last.item.seed).toBeTypeOf('number');
    expect(last.duration).toBe(15_000);
    radio.stop();
  });

  test('round-robin przy wielu trybach', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg')],
      specials: [slot('one'), slot('two')],
      config: { adInterval: 99, specialIntervalMs: 15_000 },
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(120_000);
    const ids = states.filter((s) => s.item.kind === 'special').map((s) => s.item.specialId);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids[0]).toBe('one');
    expect(ids[1]).toBe('two');
    radio.stop();
  });

  test('getSpecialData zwraca null → slajd pominięty, grają memy', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg'), img('b.jpg')],
      specials: [slot('x')],
      getSpecialData: () => null,
      config: { adInterval: 99, specialIntervalMs: 5_000 },
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(states.every((s) => s.item.kind === 'image')).toBe(true);
    radio.stop();
  });

  test('po pominięciu slajd wraca, gdy dane się pojawią', async () => {
    let data: unknown = null;
    const { radio, states } = setup({
      memes: [img('a.jpg')],
      specials: [slot('x')],
      getSpecialData: () => data,
      config: { adInterval: 99, specialIntervalMs: 5_000 },
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(30_000); // kilka pominięć
    expect(states.some((s) => s.item.kind === 'special')).toBe(false);
    data = { gotowe: true };
    await vi.advanceTimersByTimeAsync(30_000);
    const sp = states.find((s) => s.item.kind === 'special');
    expect(sp?.item.data).toEqual({ gotowe: true });
    radio.stop();
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npx vitest run src/server/radio.test.ts`
Expected: FAIL — `SpecialSlot` nie istnieje, konstruktor nie zna `getSpecialData`.

- [ ] **Step 3: Implementacja w `src/server/radio.ts`**

1. Usuń import `SpecialMode`; dodaj na górze (pod importami):

```ts
export interface SpecialSlot {
  id: string;
  duration: number; // ms
}
```

2. W `RadioDeps` podmień `specials: SpecialMode[]` na:

```ts
  specials: SpecialSlot[];
  getSpecialData: (id: string) => unknown;
```

3. W klasie: pole `private specials: SpecialMode[]` → `private specials: SpecialSlot[]`; dodaj `private getSpecialData: (id: string) => unknown;` i w konstruktorze `this.getSpecialData = deps.getSpecialData;`.

4. Podmień pola stanu specials:

```ts
  private pendingSpecial: SpecialSlot | null = null;
```

(usuń pole `fetchingSpecial` — nie ma już asynchronicznego fetchu).

5. W `start()` podmień wywołanie w interwale: `this.prefetchSpecial()` → `this.queueSpecial()`.

6. Zastąp metodę `prefetchSpecial()`:

```ts
  private queueSpecial(): void {
    if (this.specials.length === 0 || this.pendingSpecial) return;
    this.pendingSpecial = this.specials[this.specialIndex % this.specials.length];
    this.specialIndex++;
  }
```

7. W `advance()` zastąp blok `if (this.pendingSpecial) { ... }`:

```ts
    if (this.pendingSpecial) {
      const slot = this.pendingSpecial;
      this.pendingSpecial = null;
      const data = this.getSpecialData(slot.id);
      if (data != null) return this.playSpecial(slot, data);
      // brak snapshotu — slajd pominięty w tej rundzie, interwał zakolejkuje następny
    }
```

8. Podmień sygnaturę `playSpecial`:

```ts
  private playSpecial(slot: SpecialSlot, data: unknown): void {
    this.setState(
      { kind: 'special', specialId: slot.id, name: slot.id, data, seed: Math.floor(this.rng() * 2 ** 31) },
      slot.duration,
      false,
    );
  }
```

- [ ] **Step 4: Testy przechodzą**

Run: `npx vitest run src/server/radio.test.ts && npm run typecheck`
Expected: radio PASS w całości; typecheck zgłosi błąd w `src/server/app.ts` (stare depsy) — to naprawia Task 6, więc na tym etapie akceptujemy błąd wyłącznie w `app.ts`. Jeśli Task 6 robi kto inny/później: w `app.ts` tymczasowo przekaż `specials: createSpecials(config.haToken).map(({ id, duration }) => ({ id, duration }))` i `getSpecialData: () => null`, żeby typecheck przechodził (slajdy specjalne chwilowo pomijane — Task 6 to odwróci).

- [ ] **Step 5: Commit**

```bash
git add src/server/radio.ts src/server/radio.test.ts src/server/app.ts
git commit -m "feat: radio gra specials ze snapshotu getSpecialData zamiast własnego fetchu"
```

---

### Task 6: Spięcie w `app.ts` — poller, ticker, broadcast, komendy panelu

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/specials/index.ts`
- Test: `src/server/app.test.ts`

**Interfaces:**
- Consumes: `TickerStore` (Task 3), `StatusPoller` (Task 4), `SpecialSlot`/`getSpecialData` (Task 5), `Config.statusIntervalMs`/`dataDir` (Task 1), typy WS (Task 2).
- Produces: `createApp(config: Config, opts?: { fetchFn?: typeof fetch }): Promise<App>`; `createSpecials(haToken: string, fetchFn?: typeof fetch): SpecialMode[]`. Protokół WS: klient przy połączeniu dostaje `state`, `history`, `ticker` oraz `status` (gdy poller ma już dane); `addTicker`/`removeTicker` modyfikują listę i broadcastują `ticker`.

- [ ] **Step 1: Zaktualizuj testy (failujące)**

W `src/server/app.test.ts`:

1. W `beforeEach` podmień konfigurację i tworzenie appki (wstrzykujemy padający `fetch`, żeby testy nie chodziły do sieci; `STATUS_INTERVAL: '1'` — szybkie ticki):

```ts
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'memiarka-app-'));
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
```

2. Podmień asercję w teście `'po połączeniu klient dostaje state (idle) i history'` (status może dojść przed albo po sprawdzeniu — porównujemy prefiks i nazwę testu):

```ts
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
```

3. Dopisz nowe testy na końcu `describe('app', ...)`:

```ts
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
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npx vitest run src/server/app.test.ts`
Expected: FAIL — `createApp` nie przyjmuje drugiego argumentu, brak wiadomości `ticker`/`status`.

- [ ] **Step 3: Implementacja**

1. `src/server/specials/index.ts` — przelotka `fetchFn` (fabryki już ją przyjmują):

```ts
export function createSpecials(haToken: string, fetchFn: typeof fetch = fetch): SpecialMode[] {
  return [createPantrySpecial(fetchFn), createShowersSpecial(haToken, fetchFn)];
}
```

2. `src/server/app.ts` — importy i spięcie. Dodaj importy:

```ts
import type { ClientMessage, HistoryMessage, PantryData, ShowersData, StatusMessage, TickerMessage } from '../shared/types';
import { StatusPoller } from './status-poller';
import { TickerStore } from './ticker';
```

Podmień sygnaturę:

```ts
export async function createApp(config: Config, opts: { fetchFn?: typeof fetch } = {}): Promise<App> {
```

Po utworzeniu bibliotek mediów, a przed `new Radio`, dodaj:

```ts
  const specials = createSpecials(config.haToken, opts.fetchFn);
  const poller = new StatusPoller(specials, config.statusIntervalMs);
  const ticker = new TickerStore(join(config.dataDir, 'ticker.json'));
```

W depsach `Radio` podmień `specials: createSpecials(config.haToken)` na:

```ts
    specials: specials.map(({ id, duration }) => ({ id, duration })),
    getSpecialData: (id) => poller.getData(id),
```

Obok `historyMessage` dodaj:

```ts
  const tickerMessage = (): TickerMessage => ({ type: 'ticker', messages: ticker.messages() });
  const statusMessage = (): StatusMessage | null => {
    const pantry = poller.getData('pantry') as PantryData | null;
    const showers = poller.getData('showers') as ShowersData | null;
    return pantry && showers ? { type: 'status', pantry, showers } : null;
  };
```

W `wss.on('connection', ...)` po wysłaniu `history` dodaj:

```ts
    ws.send(JSON.stringify(tickerMessage()));
    const status = statusMessage();
    if (status) ws.send(JSON.stringify(status));
```

W obsłudze wiadomości dopisz gałęzie (po `stopAd`):

```ts
      } else if (msg.type === 'addTicker' && typeof msg.text === 'string') {
        ticker.add(msg.text);
      } else if (msg.type === 'removeTicker' && typeof msg.id === 'string') {
        ticker.remove(msg.id);
      }
```

Przed `radio.start()` dodaj:

```ts
  poller.on('update', () => {
    const status = statusMessage();
    if (status) broadcast(status);
  });
  ticker.on('update', () => broadcast(tickerMessage()));
  poller.start();
```

W `stop()` (obok `radio.stop()`):

```ts
      poller.stop();
```

Jeśli w Tasku 5 dodano w `app.ts` tymczasowe `getSpecialData: () => null` — usuń je (zastępuje je wersja z pollerem powyżej).

- [ ] **Step 4: Testy i typy przechodzą**

Run: `npm test && npm run typecheck`
Expected: PASS — całość, łącznie ze starymi testami app (stub `fetchFn` rzuca, więc pantry/showers zwracają dane `unknown` natychmiast, bez sieci).

- [ ] **Step 5: Commit**

```bash
git add src/server/app.ts src/server/specials/index.ts src/server/app.test.ts
git commit -m "feat: broadcast statusu i tickera po WS, komendy addTicker/removeTicker"
```

---

### Task 7: Player — paski w UI

**Files:**
- Modify: `src/client/player.html`
- Modify: `src/client/player/style.css`
- Modify: `src/client/player/main.ts`

**Interfaces:**
- Consumes: wiadomości `ticker` i `status` (Task 6), typy z Tasku 2, `IncomingMessage` z `connection.ts`.

- [ ] **Step 1: HTML — struktura pasków**

W `src/client/player.html` podmień zawartość `<body>` tak, by `#stage` był otoczony paskami (reszta `#stage` bez zmian):

```html
<body>
  <div id="ticker-bar" class="hidden">
    <div id="ticker-track"><span id="ticker-a"></span><span id="ticker-b"></span></div>
  </div>
  <div id="stage">
    <img id="layer-img" class="layer" alt="">
    <video id="layer-video" class="layer" playsinline></video>
    <canvas id="layer-canvas" class="layer"></canvas>
    <div id="video-error" class="overlay hidden"></div>
    <div id="idle" class="overlay hidden">wrzuć pliki do ./media</div>
    <div id="banner" class="hidden">NOWY MEM!</div>
    <div id="start-overlay" class="overlay">
      <button id="start">▶ START</button>
      <button id="fullscreen">Pełny ekran</button>
    </div>
  </div>
  <div id="status-bar">
    <div id="status-pantry" class="status-group"></div>
    <div id="status-showers" class="status-group"></div>
  </div>
  <script type="module" src="./player/main.ts"></script>
</body>
```

- [ ] **Step 2: CSS — layout kolumnowy i style pasków**

W `src/client/player/style.css` podmień dwie pierwsze reguły layoutu:

```css
html, body { height: 100%; background: #000; overflow: hidden; }
body { display: flex; flex-direction: column; }
#stage { position: relative; flex: 1; min-height: 0; }
```

i dopisz na końcu pliku:

```css
#ticker-bar {
  height: 5vh; min-height: 32px; display: flex; align-items: center; overflow: hidden;
  background: #101018; border-bottom: 1px solid #2a2a38;
  font: 600 3vh system-ui, sans-serif; color: #ffd75e;
}
#ticker-track { display: inline-flex; white-space: nowrap; animation: ticker-scroll linear infinite; }
@keyframes ticker-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
#status-bar {
  height: 5vh; min-height: 36px; display: flex; justify-content: space-between; align-items: center;
  padding: 0 1.5vw; background: #101018; border-top: 1px solid #2a2a38;
  font: 600 2.6vh system-ui, sans-serif;
}
.status-group { display: flex; gap: 2vw; }
.status-item { white-space: nowrap; }
.status-item.ok { color: #6fd66f; }
.status-item.warn { color: #ffd75e; }
.status-item.bad { color: #ff6b6b; }
.status-item.unknown { color: #777; }
```

- [ ] **Step 3: main.ts — rendering pasków**

W `src/client/player/main.ts`:

1. Rozszerz import typów:

```ts
import type { PantryItemState, ShowerState, StateMessage, StatusMessage, TickerItem } from '../../shared/types';
```

2. Pod istniejącymi selektorami dodaj:

```ts
const tickerBar = $('#ticker-bar');
const tickerTrack = $('#ticker-track');
const tickerA = $('#ticker-a');
const tickerB = $('#ticker-b');
const statusPantry = $('#status-pantry');
const statusShowers = $('#status-showers');
```

3. Rozszerz callback połączenia (paski działają niezależnie od `started` i overlaya START):

```ts
  const conn = connect((msg) => {
    if (msg.type === 'state') {
      lastState = msg;
      if (started && stateKey(msg) !== appliedKey) apply(msg);
    } else if (msg.type === 'ticker') {
      renderTicker(msg.messages);
    } else if (msg.type === 'status') {
      renderStatus(msg);
    }
  });
```

4. Dopisz na końcu pliku (przed blokiem `if (preview)`):

```ts
const TICKER_SPEED_PX_S = 120; // stała prędkość — dłuższa treść przewija się dłużej

function renderTicker(messages: TickerItem[]): void {
  if (messages.length === 0) {
    tickerBar.classList.add('hidden');
    return;
  }
  tickerBar.classList.remove('hidden');
  // treść zduplikowana (a+b) — animacja do -50% zapętla się płynnie
  const text = messages.map((m) => m.text).join('   •   ') + '   •   ';
  tickerA.textContent = text;
  tickerB.textContent = text;
  requestAnimationFrame(() => {
    tickerTrack.style.animationDuration = `${Math.max(8, tickerA.offsetWidth / TICKER_SPEED_PX_S)}s`;
  });
}

const PANTRY_CLS: Record<string, string> = { ok: 'ok', low: 'warn', out: 'bad', unknown: 'unknown' };

function statusItem(text: string, cls: string): HTMLElement {
  const el = document.createElement('span');
  el.className = `status-item ${cls}`;
  el.textContent = text;
  return el;
}

function showerBadge(s: ShowerState): { label: string; cls: string } {
  if (s.occupancy === 'occupied') return { label: 'zajęty', cls: 'bad' };
  if (s.occupancy === 'free') return { label: 'wolny', cls: 'ok' };
  // czujników obecności jeszcze nie ma w HA — fallback na światło
  if (s.light === 'on') return { label: 'zajęty?', cls: 'warn' };
  if (s.light === 'off') return { label: 'wolny?', cls: 'ok' };
  return { label: '?', cls: 'unknown' };
}

function renderStatus(msg: StatusMessage): void {
  const pantry: [string, PantryItemState][] = [
    ['🧀 ser', msg.pantry.ser],
    ['🥛 mleko', msg.pantry.mleko],
    ['🍞 chleb', msg.pantry.chleb],
  ];
  statusPantry.replaceChildren(
    ...pantry.map(([label, item]) => statusItem(label, PANTRY_CLS[item.status] ?? 'unknown')),
  );
  const showers: [string, ShowerState][] = [
    ['qWWWetek', msg.showers.qwwwetek],
    ['qWWWetka', msg.showers.qwwwetka],
    ['WWWipownia', msg.showers.wwwipownia],
  ];
  statusShowers.replaceChildren(
    ...showers.map(([name, s]) => {
      const b = showerBadge(s);
      return statusItem(`🚿 ${name}: ${b.label}`, b.cls);
    }),
  );
}

// Szare „?" do czasu pierwszej wiadomości status.
renderStatus({
  type: 'status',
  pantry: {
    ser: { status: 'unknown', text: '?' },
    mleko: { status: 'unknown', text: '?' },
    chleb: { status: 'unknown', text: '?' },
  },
  showers: {
    qwwwetek: { light: 'unknown', occupancy: 'unknown' },
    qwwwetka: { light: 'unknown', occupancy: 'unknown' },
    wwwipownia: { light: 'unknown', occupancy: 'unknown', somtasma: 'unknown', somtasmaPreset: null },
  },
});
```

- [ ] **Step 4: Weryfikacja**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Ręcznie: `HA_TOKEN=<token> npm run dev`, otwórz `http://localhost:8080/player`:
- dolny pasek widoczny od razu (szare „?"), po ≤5 s wypełnia się danymi (przy działającym HA/pantry — kolory),
- górny pasek niewidoczny (pusta lista). Test tickera: `echo '[{"id":"t1","text":"Test przewijania tickera"}]' > data/ticker.json`, restart dev — pasek widoczny i przewija się płynnie,
- mem/film mieści się między paskami (nic nie zasłonięte), `?preview=pantry` renderuje canvas w pomniejszonej scenie.

Po weryfikacji usuń testowy `data/ticker.json` (albo zostaw — to katalog danych, nie repo; upewnij się, że `data/` nie trafia do gita — patrz Task 9).

- [ ] **Step 5: Commit**

```bash
git add src/client/player.html src/client/player/style.css src/client/player/main.ts
git commit -m "feat: paski w playerze — ticker u góry, status zapasów i pryszniców na dole"
```

---

### Task 8: Panel — zarządzanie tickerem

**Files:**
- Modify: `src/client/index.html`
- Modify: `src/client/panel/main.ts`
- Modify: `src/client/panel/style.css`

**Interfaces:**
- Consumes: wiadomości `ticker` (Task 6), `AddTickerMessage`/`RemoveTickerMessage` (Task 2).

- [ ] **Step 1: HTML — sekcja „Pasek informacyjny"**

W `src/client/index.html` wstaw nową sekcję między `#now-playing` a `#history-section`:

```html
  <section id="ticker-section">
    <h2>Pasek informacyjny</h2>
    <form id="ticker-form">
      <input id="ticker-text" type="text" maxlength="500" placeholder="treść komunikatu…" autocomplete="off">
      <button type="submit">Dodaj</button>
    </form>
    <ul id="ticker-list"></ul>
  </section>
```

- [ ] **Step 2: main.ts — logika**

W `src/client/panel/main.ts`:

1. Rozszerz import typów:

```ts
import type { HistoryEntry, ItemKind, StateMessage, TickerItem } from '../../shared/types';
```

2. Pod istniejącymi selektorami dodaj:

```ts
const tickerForm = $<HTMLFormElement>('#ticker-form');
const tickerText = $<HTMLInputElement>('#ticker-text');
const tickerList = $<HTMLUListElement>('#ticker-list');
```

3. Obok `let history: HistoryEntry[] = [];` dodaj `let ticker: TickerItem[] = [];` i podmień callback połączenia (dotychczasowy `else` obsługiwał tylko history — teraz gałęzie jawne):

```ts
const conn = connect((msg) => {
  if (msg.type === 'state') {
    state = msg;
    renderNow();
  } else if (msg.type === 'history') {
    history = msg.entries;
    renderHistory();
  } else if (msg.type === 'ticker') {
    ticker = msg.messages;
    renderTicker();
  }
  // 'status' — w panelu ignorowane
});
```

4. Pod listenerami przycisków reklam dodaj:

```ts
tickerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = tickerText.value.trim();
  if (!text) return;
  conn.send({ type: 'addTicker', text });
  tickerText.value = '';
});
```

5. Dopisz na końcu pliku:

```ts
function renderTicker(): void {
  tickerList.replaceChildren(
    ...ticker.map((m) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = m.text;
      const del = document.createElement('button');
      del.className = 'ticker-remove';
      del.textContent = '✕';
      del.title = 'Usuń komunikat';
      del.addEventListener('click', () => conn.send({ type: 'removeTicker', id: m.id }));
      li.append(name, del);
      return li;
    }),
  );
}
```

- [ ] **Step 3: CSS**

Dopisz na końcu `src/client/panel/style.css`:

```css
#ticker-form { display: flex; gap: 0.75rem; margin-bottom: 0.75rem; }
#ticker-text { flex: 1; font: inherit; background: #14141c; color: #eee; border: 1px solid #444; border-radius: 0.3rem; padding: 0.4rem 0.6rem; }
.ticker-remove { margin-left: auto; background: #a53a3a; padding: 0.3rem 0.7rem; }
```

- [ ] **Step 4: Weryfikacja**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Ręcznie: `HA_TOKEN=<token> npm run dev`, otwórz panel `http://localhost:8080/` i player w drugiej karcie:
- dodanie komunikatu → pojawia się na liście w panelu i natychmiast w tickerze playera,
- ✕ usuwa; po usunięciu ostatniego pasek w playerze znika, a scena rośnie,
- restart serwera → komunikaty wracają (z `data/ticker.json`).

- [ ] **Step 5: Commit**

```bash
git add src/client/index.html src/client/panel/main.ts src/client/panel/style.css
git commit -m "feat: panel — zarządzanie komunikatami paska informacyjnego"
```

---

### Task 9: Docker, .gitignore i README

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.gitignore` (jeśli nie istnieje — utwórz; sprawdź najpierw zawartość)
- Modify: `README.md`

- [ ] **Step 1: Dockerfile — domyślny `DATA_DIR`**

W linii `ENV` dopisz `DATA_DIR=/data`:

```dockerfile
ENV NODE_ENV=production PORT=8080 MEDIA_DIR=/media ADS_DIR=/ads DATA_DIR=/data
```

- [ ] **Step 2: docker-compose — wolumen danych**

W `docker-compose.yml` do `volumes` dopisz:

```yaml
      - ./data:/data
```

- [ ] **Step 3: .gitignore — katalog danych**

Sprawdź `cat .gitignore`; dopisz (lub utwórz plik z) linią:

```
data/
```

(`node_modules`/`dist` powinny już tam być — jeśli nie, nie ruszaj, to poza zakresem).

- [ ] **Step 4: README**

W `README.md`:

1. Do tabeli „Konfiguracja (env)" dopisz wiersze:

```markdown
| `STATUS_INTERVAL` | `5` | interwał odświeżania pasków statusu (s) |
| `DATA_DIR` | `./data` | katalog danych trwałych (komunikaty tickera) |
```

2. Po sekcji „Tryby specjalne" dodaj sekcję:

```markdown
## Paski w playerze

Górny pasek to przewijany ticker — komunikaty dodaje się i usuwa w panelu
(sekcja „Pasek informacyjny"); lista jest trwała (`DATA_DIR/ticker.json`),
pusta lista ukrywa pasek. Dolny pasek pokazuje status zapasów (ser/mleko/chleb)
i zajętość pryszniców — serwer odpytuje źródła co `STATUS_INTERVAL` sekund
i wypycha zmiany do playerów po WebSockecie. Dopóki w Home Assistancie nie ma
czujników obecności, zajętość prysznica zgaduje się ze stanu światła
(„zajęty?"/„wolny?").
```

3. W opisie docker-compose dopisz, że montowany jest też `./data` → `/data`.

- [ ] **Step 5: Weryfikacja i commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add Dockerfile docker-compose.yml .gitignore README.md
git commit -m "docs: DATA_DIR i STATUS_INTERVAL w Dockerze i README, sekcja o paskach"
```
