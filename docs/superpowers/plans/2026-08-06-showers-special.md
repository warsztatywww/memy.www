# Tryb specjalny „showers" (status pryszniców) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nowy slajd (tryb specjalny) pokazujący status świateł i (przyszłej) zajętości trzech pryszniców na podstawie Home Assistanta.

**Architecture:** Tryb specjalny wg wzorca `pantry`: moduł serwerowy (`fetchData()` — jedno zapytanie `GET /api/states` do HA z Bearer tokenem) + moduł kliencki (`render()` na canvasie) + wpisy w obu rejestrach. `HA_TOKEN` staje się wymaganą zmienną env (brak → błąd startu), więc rejestr serwerowy zmienia się z listy budowanej na poziomie modułu na funkcję `createSpecials(haToken)`.

**Tech Stack:** Node 22+, TypeScript, Express, vitest, canvas 2D (bez nowych zależności).

**Spec:** `docs/superpowers/specs/2026-08-06-showers-special-design.md`

## Global Constraints

- Zero nowych zależności npm.
- URL HA i nazwy encji zahardkodowane w `src/server/specials/showers.ts`: baza `http://smart.www22.duck.edu.pl`, światła `switch.qwwwetek` / `switch.qwwwetka` / `switch.vipownia_wwwipownia`, somtaśma `light.somtasma` + `select.somtasma_preset`, przewidywane czujniki `binary_sensor.qwwwetek_occupancy` / `binary_sensor.qwwwetka_occupancy` / `binary_sensor.wwwipownia_occupancy`.
- `HA_TOKEN` bez wartości domyślnej w kodzie; ustawiany wyłącznie w `docker-compose.yml` (a w dev ręcznie w środowisku). Bez pliku `.env`.
- Wartość startowa tokena (świadomie commitowana do repo, decyzja użytkownika):
  `REDACTED_HA_TOKEN`
- Komentarze, teksty na slajdzie i komunikaty commitów po polsku, styl jak w istniejącym kodzie (por. `pantry.ts`).
- Oficjalna pisownia nazw: qWWWetek, qWWWetka, WWWIPownia (alias „KONFESJONAŁ"), całość: qWWWη (czyt. „kuweta").
- Testy: `npm test` (vitest run), typy: `npm run typecheck`, build klienta: `npm run build`.

---

### Task 1: Wymagany `HA_TOKEN` w konfiguracji

**Files:**
- Modify: `src/server/config.ts`
- Modify: `src/server/config.test.ts`
- Modify: `src/server/app.test.ts:17` (fixture configu musi dostać `HA_TOKEN`)

**Interfaces:**
- Consumes: —
- Produces: `Config.haToken: string` (niepusty; `loadConfig()` rzuca `Error` z „HA_TOKEN" w treści, gdy env brak/pusty). Task 3 czyta `config.haToken`.

- [ ] **Step 1: Napisz testy (nowe + aktualizacja istniejących)**

W `src/server/config.test.ts`: wszystkie istniejące wywołania `loadConfig({...})` dostają dodatkowo `HA_TOKEN: 't'`, a asercja „nadpisywanie z env" pole `haToken: 't'`. Dopisz nowy test:

```ts
  test('brak lub pusty HA_TOKEN → błąd startu', () => {
    expect(() => loadConfig({})).toThrow(/HA_TOKEN/);
    expect(() => loadConfig({ HA_TOKEN: '   ' })).toThrow(/HA_TOKEN/);
  });
```

Czyli po zmianach np. test domyślnych wartości zaczyna się od `const c = loadConfig({ HA_TOKEN: 't' });`, a test śmieciowych wartości od `const c = loadConfig({ PORT: 'abc', IMAGE_DURATION: '-5', HA_TOKEN: 't' });`.

W `src/server/app.test.ts` linia 17 — dopisz `HA_TOKEN: 't'`:

```ts
  const config = loadConfig({ MEDIA_DIR: join(dir, 'media'), ADS_DIR: join(dir, 'ads'), PORT: '0', HA_TOKEN: 't' });
```

- [ ] **Step 2: Uruchom testy — nowy test ma FAILować**

Run: `npx vitest run src/server/config.test.ts`
Expected: FAIL — „brak lub pusty HA_TOKEN" (loadConfig nie rzuca), pozostałe PASS.

- [ ] **Step 3: Implementacja w `config.ts`**

Do interfejsu `Config` dodaj pole, do `loadConfig()` walidację:

```ts
export interface Config {
  port: number;
  mediaDir: string;
  adsDir: string;
  imageDurationMs: number;
  adInterval: number;
  specialIntervalMs: number;
  historySize: number;
  haToken: string;
}
```

```ts
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const haToken = (env.HA_TOKEN ?? '').trim();
  if (!haToken) {
    throw new Error('Brak HA_TOKEN (token Home Assistanta) — ustaw w docker-compose.yml albo w środowisku.');
  }
  return {
    port: num(env.PORT, 8080),
    mediaDir: resolve(env.MEDIA_DIR ?? './media'),
    adsDir: resolve(env.ADS_DIR ?? './ads'),
    imageDurationMs: num(env.IMAGE_DURATION, 10) * 1000,
    adInterval: num(env.AD_INTERVAL, 10),
    specialIntervalMs: num(env.SPECIAL_INTERVAL, 300) * 1000,
    historySize: num(env.HISTORY_SIZE, 50),
    haToken,
  };
}
```

- [ ] **Step 4: Uruchom testy — wszystko PASS**

Run: `npm test`
Expected: PASS (w tym `app.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/server/config.ts src/server/config.test.ts src/server/app.test.ts
git commit -m "feat: wymagany HA_TOKEN w konfiguracji"
```

---

### Task 2: Typy współdzielone + serwerowy moduł `showers`

**Files:**
- Modify: `src/shared/types.ts` (dopisz na końcu)
- Create: `src/server/specials/showers.ts`
- Test: `src/server/specials/showers.test.ts`

**Interfaces:**
- Consumes: `SpecialMode` z `src/server/specials/index.ts` (bez zmian w tym tasku).
- Produces:
  - typy `ShowerLight`, `ShowerOccupancy`, `ShowerState`, `WwwipowniaState`, `ShowersData` w `src/shared/types.ts` (używa ich Task 4);
  - `createShowersSpecial(token: string, fetchFn: typeof fetch = fetch): SpecialMode` — id `'showers'`, duration `15_000`, `fetchData(): Promise<ShowersData>` (używa go Task 3).

- [ ] **Step 1: Dopisz typy do `src/shared/types.ts`**

```ts
export type ShowerLight = 'on' | 'off' | 'unknown';
export type ShowerOccupancy = 'occupied' | 'free' | 'unknown';
export interface ShowerState {
  light: ShowerLight;
  occupancy: ShowerOccupancy; // z czujnika obecności; 'unknown' dopóki czujników nie ma w HA
}
export interface WwwipowniaState extends ShowerState {
  somtasma: ShowerLight; // pasek LED
  somtasmaPreset: string | null; // nazwa presetu WLED albo null
}
export interface ShowersData {
  qwwwetek: ShowerState;
  qwwwetka: ShowerState;
  wwwipownia: WwwipowniaState;
}
```

- [ ] **Step 2: Napisz failujące testy `src/server/specials/showers.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import type { ShowersData } from '../../shared/types';
import { createShowersSpecial } from './showers';

const TOKEN = 'test-token';

function haResponse(states: Record<string, string>): Response {
  const body = Object.entries(states).map(([entity_id, state]) => ({ entity_id, state }));
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

const FULL: Record<string, string> = {
  'switch.qwwwetek': 'on',
  'switch.qwwwetka': 'off',
  'switch.vipownia_wwwipownia': 'on',
  'light.somtasma': 'on',
  'select.somtasma_preset': 'Rainbow',
};

describe('createShowersSpecial', () => {
  test('mapuje światła i somtaśmę; brak czujników → occupancy unknown', async () => {
    const fakeFetch = (async () => haResponse(FULL)) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data.qwwwetek).toEqual({ light: 'on', occupancy: 'unknown' });
    expect(data.qwwwetka).toEqual({ light: 'off', occupancy: 'unknown' });
    expect(data.wwwipownia).toEqual({ light: 'on', occupancy: 'unknown', somtasma: 'on', somtasmaPreset: 'Rainbow' });
  });

  test('wysyła token w nagłówku Authorization', async () => {
    let auth: string | undefined;
    const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
      auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return haResponse(FULL);
    }) as typeof fetch;
    await createShowersSpecial(TOKEN, fakeFetch).fetchData();
    expect(auth).toBe(`Bearer ${TOKEN}`);
  });

  test('czujniki obecności on/off → occupied/free', async () => {
    const fakeFetch = (async () =>
      haResponse({
        ...FULL,
        'binary_sensor.qwwwetek_occupancy': 'on',
        'binary_sensor.qwwwetka_occupancy': 'off',
      })) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data.qwwwetek.occupancy).toBe('occupied');
    expect(data.qwwwetka.occupancy).toBe('free');
    expect(data.wwwipownia.occupancy).toBe('unknown');
  });

  test('stan unavailable → unknown; preset unknown → null', async () => {
    const fakeFetch = (async () =>
      haResponse({
        'switch.qwwwetek': 'unavailable',
        'select.somtasma_preset': 'unknown',
      })) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data.qwwwetek.light).toBe('unknown');
    expect(data.wwwipownia.somtasmaPreset).toBeNull();
  });

  test('HTTP != 200 → wszystko unknown', async () => {
    const fakeFetch = (async () => new Response('err', { status: 500 })) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data).toEqual({
      qwwwetek: { light: 'unknown', occupancy: 'unknown' },
      qwwwetka: { light: 'unknown', occupancy: 'unknown' },
      wwwipownia: { light: 'unknown', occupancy: 'unknown', somtasma: 'unknown', somtasmaPreset: null },
    });
  });

  test('błąd sieci → wszystko unknown', async () => {
    const fakeFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data.qwwwetek.light).toBe('unknown');
  });
});
```

- [ ] **Step 3: Uruchom testy — FAIL**

Run: `npx vitest run src/server/specials/showers.test.ts`
Expected: FAIL — moduł `./showers` nie istnieje.

- [ ] **Step 4: Implementacja `src/server/specials/showers.ts`**

```ts
import type { ShowerLight, ShowerOccupancy, ShowersData } from '../../shared/types';
import type { SpecialMode } from './index';

const HA_URL = 'http://smart.www22.duck.edu.pl';
const FETCH_TIMEOUT_MS = 3000;

const LIGHTS = {
  qwwwetek: 'switch.qwwwetek',
  qwwwetka: 'switch.qwwwetka',
  wwwipownia: 'switch.vipownia_wwwipownia',
} as const;

// Przewidywane ID czujników obecności — podmienić, gdy pojawią się w HA.
const PRESENCE = {
  qwwwetek: 'binary_sensor.qwwwetek_occupancy',
  qwwwetka: 'binary_sensor.qwwwetka_occupancy',
  wwwipownia: 'binary_sensor.wwwipownia_occupancy',
} as const;

const SOMTASMA_LIGHT = 'light.somtasma';
const SOMTASMA_PRESET = 'select.somtasma_preset';

interface HAState {
  entity_id: string;
  state: string;
}

function toLight(state: string | undefined): ShowerLight {
  return state === 'on' || state === 'off' ? state : 'unknown';
}

function toOccupancy(state: string | undefined): ShowerOccupancy {
  if (state === 'on') return 'occupied';
  if (state === 'off') return 'free';
  return 'unknown';
}

const UNKNOWN_DATA: ShowersData = {
  qwwwetek: { light: 'unknown', occupancy: 'unknown' },
  qwwwetka: { light: 'unknown', occupancy: 'unknown' },
  wwwipownia: { light: 'unknown', occupancy: 'unknown', somtasma: 'unknown', somtasmaPreset: null },
};

export function createShowersSpecial(token: string, fetchFn: typeof fetch = fetch): SpecialMode {
  return {
    id: 'showers',
    duration: 15_000,
    async fetchData(): Promise<ShowersData> {
      let states: Map<string, string>;
      try {
        const res = await fetchFn(`${HA_URL}/api/states`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as HAState[];
        states = new Map(raw.map((s) => [s.entity_id, s.state]));
      } catch {
        return structuredClone(UNKNOWN_DATA);
      }
      const preset = states.get(SOMTASMA_PRESET);
      return {
        qwwwetek: {
          light: toLight(states.get(LIGHTS.qwwwetek)),
          occupancy: toOccupancy(states.get(PRESENCE.qwwwetek)),
        },
        qwwwetka: {
          light: toLight(states.get(LIGHTS.qwwwetka)),
          occupancy: toOccupancy(states.get(PRESENCE.qwwwetka)),
        },
        wwwipownia: {
          light: toLight(states.get(LIGHTS.wwwipownia)),
          occupancy: toOccupancy(states.get(PRESENCE.wwwipownia)),
          somtasma: toLight(states.get(SOMTASMA_LIGHT)),
          somtasmaPreset: preset == null || preset === 'unknown' || preset === 'unavailable' ? null : preset,
        },
      };
    },
  };
}
```

- [ ] **Step 5: Uruchom testy — PASS**

Run: `npx vitest run src/server/specials/showers.test.ts && npm run typecheck`
Expected: PASS, bez błędów typów.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/server/specials/showers.ts src/server/specials/showers.test.ts
git commit -m "feat: serwerowy tryb specjalny showers (dane z Home Assistanta)"
```

---

### Task 3: Rejestr specials jako funkcja + wiring w app.ts

**Files:**
- Modify: `src/server/specials/index.ts`
- Modify: `src/server/app.ts:10,29`
- Test: `src/server/specials/index.test.ts` (nowy)

**Interfaces:**
- Consumes: `createShowersSpecial(token, fetchFn?)` z Task 2; `Config.haToken` z Task 1.
- Produces: `createSpecials(haToken: string): SpecialMode[]` — zastępuje eksport `specials`; zwraca `[pantry, showers]`. Interfejs `SpecialMode` bez zmian.

- [ ] **Step 1: Napisz failujący test `src/server/specials/index.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { createSpecials } from './index';

describe('createSpecials', () => {
  test('rejestruje pantry i showers', () => {
    expect(createSpecials('t').map((s) => s.id)).toEqual(['pantry', 'showers']);
  });
});
```

- [ ] **Step 2: Uruchom test — FAIL**

Run: `npx vitest run src/server/specials/index.test.ts`
Expected: FAIL — `createSpecials` nie istnieje.

- [ ] **Step 3: Implementacja**

`src/server/specials/index.ts` w całości:

```ts
import { createPantrySpecial } from './pantry';
import { createShowersSpecial } from './showers';

export interface SpecialMode {
  id: string;
  duration: number; // ms
  fetchData(): Promise<unknown>;
}

// Nowy tryb = nowy plik w tym katalogu + wpis tutaj
// (+ odpowiednik kliencki w src/client/specials/).
export function createSpecials(haToken: string): SpecialMode[] {
  return [createPantrySpecial(), createShowersSpecial(haToken)];
}
```

W `src/server/app.ts` podmień import (linia 10) i użycie (linia 29):

```ts
import { createSpecials } from './specials/index';
```

```ts
    specials: createSpecials(config.haToken),
```

- [ ] **Step 4: Uruchom wszystkie testy — PASS**

Run: `npm test && npm run typecheck`
Expected: PASS (w tym `app.test.ts` i `radio.test.ts` — `radio.ts` importuje tylko typ `SpecialMode`, który się nie zmienił).

- [ ] **Step 5: Commit**

```bash
git add src/server/specials/index.ts src/server/specials/index.test.ts src/server/app.ts
git commit -m "feat: rejestr specials jako funkcja z tokenem HA"
```

---

### Task 4: Kliencki slajd showers (canvas)

**Files:**
- Create: `src/client/specials/showers.ts`
- Modify: `src/client/specials/index.ts`

**Interfaces:**
- Consumes: typy `ShowersData`, `ShowerState` z Task 2; `ClientSpecial` z `src/client/specials/index.ts`.
- Produces: `showersSpecial: ClientSpecial` (id `'showers'`, z `previewData`), zarejestrowany w `clientSpecials`.

Uwaga: klient nie ma testów jednostkowych (spójnie z `pantry`); weryfikacja wizualna przez tryb preview.

- [ ] **Step 1: Implementacja `src/client/specials/showers.ts`**

```ts
import type { ShowersData, ShowerState } from '../../shared/types';
import type { ClientSpecial } from './index';

const CABINS: { key: keyof ShowersData; label: string; sub?: string; x: number; w: number }[] = [
  // qWWWetek i qWWWetka sklejone (wspólna ściana), WWWIPownia osobno obok
  { key: 'qwwwetek', label: 'qWWWetek', x: 0.05, w: 0.29 },
  { key: 'qwwwetka', label: 'qWWWetka', x: 0.34, w: 0.29 },
  { key: 'wwwipownia', label: 'WWWIPownia', sub: '„KONFESJONAŁ"', x: 0.69, w: 0.26 },
];

const GREEN = '#3fbf5f';
const RED = '#e63946';
const UNKNOWN_STATE: ShowerState = { light: 'unknown', occupancy: 'unknown' };

export const showersSpecial: ClientSpecial = {
  id: 'showers',
  previewData: {
    qwwwetek: { light: 'on', occupancy: 'occupied' },
    qwwwetka: { light: 'off', occupancy: 'free' },
    wwwipownia: { light: 'on', occupancy: 'unknown', somtasma: 'on', somtasmaPreset: 'Rainbow' },
  } satisfies ShowersData,

  render(ctx, t, w, h, rawData): void {
    const data = rawData as ShowersData | null;
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${h * 0.09}px system-ui, sans-serif`;
    ctx.fillText('qWWWη', w / 2, h * 0.1);
    ctx.fillStyle = '#99aabb';
    ctx.font = `${h * 0.035}px system-ui, sans-serif`;
    ctx.fillText('STATUS PRYSZNICÓW („kuweta")', w / 2, h * 0.18);

    const top = h * 0.26;
    const bottom = h * 0.9;

    for (const cabin of CABINS) {
      const st: ShowerState = data ? data[cabin.key] : UNKNOWN_STATE;
      const x = cabin.x * w;
      const cw = cabin.w * w;
      const cx = x + cw / 2;

      // somtaśma: animowana ramka LED wokół konfesjonału
      if (cabin.key === 'wwwipownia' && data?.wwwipownia.somtasma === 'on') {
        ctx.save();
        ctx.strokeStyle = `hsl(${(t / 5) % 360}, 90%, 60%)`;
        ctx.lineWidth = 6;
        ctx.setLineDash([18, 12]);
        ctx.lineDashOffset = -t / 8;
        ctx.strokeRect(x - 8, top - 8, cw + 16, bottom - top + 16);
        ctx.restore();
      }

      // kabina
      ctx.strokeStyle = '#555566';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, top, cw, bottom - top);

      // nazwa
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${h * 0.038}px system-ui, sans-serif`;
      ctx.fillText(cabin.label, cx, top + h * 0.06);
      if (cabin.sub) {
        ctx.fillStyle = '#99aabb';
        ctx.font = `italic ${h * 0.026}px system-ui, sans-serif`;
        ctx.fillText(cabin.sub, cx, top + h * 0.11);
      }

      // światło: 💡 pulsujące gdy on, przygaszone gdy off, ❓ gdy unknown
      const lightY = top + (bottom - top) * 0.45;
      ctx.save();
      ctx.font = `${h * 0.11}px system-ui, sans-serif`;
      if (st.light === 'on') {
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t / 200);
        ctx.fillText('💡', cx, lightY);
      } else if (st.light === 'off') {
        ctx.globalAlpha = 0.25;
        ctx.fillText('💡', cx, lightY);
      } else {
        ctx.fillText('❓', cx, lightY);
      }
      ctx.restore();

      // badge zajętości — tylko gdy czujnik daje odczyt
      if (st.occupancy !== 'unknown') {
        const occupied = st.occupancy === 'occupied';
        // ZAJĘTY miga, WOLNY świeci ciągle
        if (!occupied || Math.sin(t / 120) > -0.5) {
          const by = bottom - h * 0.09;
          const bw = cw * 0.7;
          const bh = h * 0.07;
          ctx.fillStyle = occupied ? RED : GREEN;
          ctx.fillRect(cx - bw / 2, by - bh / 2, bw, bh);
          ctx.fillStyle = '#101018';
          ctx.font = `bold ${h * 0.035}px system-ui, sans-serif`;
          ctx.fillText(occupied ? 'ZAJĘTY' : 'WOLNY', cx, by);
        }
      }

      // nazwa presetu somtaśmy
      if (cabin.key === 'wwwipownia' && data?.wwwipownia.somtasmaPreset) {
        ctx.fillStyle = '#99aabb';
        ctx.font = `${h * 0.024}px system-ui, sans-serif`;
        ctx.fillText(`✨ ${data.wwwipownia.somtasmaPreset}`, cx, bottom - h * 0.03, cw * 0.9);
      }
    }
  },
};
```

- [ ] **Step 2: Rejestracja w `src/client/specials/index.ts`**

```ts
import { pantrySpecial } from './pantry';
import { showersSpecial } from './showers';

export interface ClientSpecial {
  id: string;
  previewData?: unknown; // do trybu ?preview=<id>
  render(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, data: unknown, rng: () => number): void;
}
export const clientSpecials: ClientSpecial[] = [pantrySpecial, showersSpecial];
```

- [ ] **Step 3: Build i typecheck**

Run: `npm run build && npm run typecheck`
Expected: build przechodzi bez błędów.

- [ ] **Step 4: Weryfikacja wizualna w preview**

Run: `HA_TOKEN=dummy npm run dev` i otwórz `http://localhost:8080/player?preview=showers`.
Expected: trzy kabiny (qWWWetek 💡+ZAJĘTY, qWWWetka przygaszona+WOLNY, WWWIPownia z tęczową ramką LED, bez badge'a, z „✨ Rainbow"), tytuł „qWWWη". Zatrzymaj dev po sprawdzeniu.

- [ ] **Step 5: Commit**

```bash
git add src/client/specials/showers.ts src/client/specials/index.ts
git commit -m "feat: slajd showers — kabiny qWWWη na canvasie"
```

---

### Task 5: docker-compose, README i smoke test na żywym HA

**Files:**
- Modify: `docker-compose.yml`
- Modify: `README.md` (sekcja „Szybki start (dev)" i tabela env)

**Interfaces:**
- Consumes: wymagany `HA_TOKEN` z Task 1; `createShowersSpecial` z Task 2.
- Produces: — (konfiguracja wdrożeniowa i dokumentacja).

- [ ] **Step 1: `docker-compose.yml` — token startowy**

```yaml
services:
  memiarka:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./memy:/media
      - ./reklamy:/ads
    environment:
      # token Home Assistanta (smart.www22.duck.edu.pl) — wymagany
      HA_TOKEN: "REDACTED_HA_TOKEN"
    restart: unless-stopped
```

- [ ] **Step 2: README**

W tabeli env dopisz wiersz:

```markdown
| `HA_TOKEN` | — (wymagany) | token Home Assistanta (slajd statusu pryszniców) |
```

W sekcji „Szybki start (dev)" podmień komendę dev na wariant z tokenem:

```bash
HA_TOKEN=<token> npm run dev        # vite build --watch + tsx watch
```

- [ ] **Step 3: Smoke test na żywym Home Assistancie**

Run (token z Global Constraints w miejsce `<TOKEN>`):

```bash
npx tsx -e "import('./src/server/specials/showers.ts').then(async (m) => { console.log(JSON.stringify(await m.createShowersSpecial('<TOKEN>').fetchData(), null, 2)); })"
```

Expected: JSON z realnymi stanami — `light` to `'on'`/`'off'` (nie `'unknown'`!), wszystkie `occupancy: 'unknown'` (czujników jeszcze nie ma), `somtasma` `'on'`/`'off'`, `somtasmaPreset` to string albo null. Jeśli wszystko wyszło `unknown` — token/sieć nie działa, nie commitować dopóki nie wyjaśnione.

- [ ] **Step 4: Pełna weryfikacja**

Run: `npm test && npm run typecheck && npm run build`
Expected: wszystko PASS.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml README.md
git commit -m "feat: HA_TOKEN w docker-compose i README dla slajdu showers"
```
