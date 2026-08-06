# Tryb specjalny „showers" — status pryszniców (qWWWη)

Data: 2026-08-06

## Cel

Nowy slajd (tryb specjalny) pokazujący status trzech pryszniców na podstawie
danych z Home Assistanta (`http://smart.www22.duck.edu.pl`): stan świateł już
teraz, stan zajętości (czujniki obecności) gdy tylko zostaną podłączone.

## Kontekst

Memiarka ma wzorzec „trybów specjalnych": para modułów o wspólnym `id` —
`src/server/specials/<id>.ts` (`fetchData()`) + `src/client/specials/<id>.ts`
(`render()` na canvasie) + wpisy w obu rejestrach. Wzorcem jest istniejący tryb
`pantry`. Tryb `showers` powiela ten wzorzec 1:1.

## Źródło danych

Jedno zapytanie `GET http://smart.www22.duck.edu.pl/api/states` z nagłówkiem
`Authorization: Bearer <token>`, timeout 3 s, wykonywane przy każdym
`fetchData()` (czyli raz na pokazanie slajdu). URL i nazwy encji zahardkodowane
w module serwerowym.

### Mapowanie encji (hardkod)

| Prysznic | Światło | Obecność (przyszłość) | Dodatki |
|---|---|---|---|
| qWWWetek | `switch.qwwwetek` | `binary_sensor.qwwwetek_occupancy` | — |
| qWWWetka | `switch.qwwwetka` | `binary_sensor.qwwwetka_occupancy` | — |
| WWWIPownia | `switch.vipownia_wwwipownia` | `binary_sensor.wwwipownia_occupancy` | `light.somtasma` (on/off), `select.somtasma_preset` (nazwa presetu) |

Encje obecności to przewidywane ID — do podmiany, gdy czujniki pojawią się
w HA. Encja nieobecna w odpowiedzi → `occupancy: 'unknown'` i klient nie rysuje
wskaźnika zajętości. Kod jest więc gotowy od razu; po wstawieniu właściwych ID
slajd zacznie pokazywać zajętość bez innych zmian.

### Obsługa błędów

- Błąd HTTP / timeout / niepoprawny JSON → wszystkie pola `unknown`
  (slajd pokazuje `?`, jak pantry).
- Stan encji inny niż `on`/`off` (np. `unavailable`) → `unknown`.

## Konfiguracja

- `HA_TOKEN` — nowa zmienna env w `config.ts`, z domyślną wartością wpisaną na
  stałe (token dostarczony przez użytkownika), żeby dev działał bez konfiguracji.
- `docker-compose.yml` dostaje `environment: HA_TOKEN: <ten sam token>` jako
  widoczne miejsce podmiany. Bez pliku `.env` (świadoma decyzja użytkownika —
  token trafia do repo).
- `HA_TOKEN` ustawiony na pusty string → tryb `showers` nie jest rejestrowany.
- Wpis w tabeli env w README.

## Typy (`src/shared/types.ts`)

```ts
export type ShowerLight = 'on' | 'off' | 'unknown';
export type ShowerOccupancy = 'occupied' | 'free' | 'unknown';

export interface ShowerState {
  light: ShowerLight;
  occupancy: ShowerOccupancy;
}

export interface ShowersData {
  qwwwetek: ShowerState;
  qwwwetka: ShowerState;
  wwwipownia: ShowerState & {
    somtasma: ShowerLight;      // pasek LED on/off
    somtasmaPreset: string | null; // nazwa presetu albo null
  };
}
```

## Serwer (`src/server/specials/showers.ts`)

- `createShowersSpecial(fetchFn: typeof fetch = fetch, token: string)` →
  `SpecialMode { id: 'showers', duration: 15_000, fetchData }`.
- `fetchData()` pobiera `/api/states`, buduje mapę `entity_id → state`,
  mapuje na `ShowersData` wg tabeli powyżej.
- Rejestracja w `src/server/specials/index.ts` warunkowo (token niepusty).
  Rejestr dostaje token z `config.ts` — jeśli obecna struktura buduje listę
  na poziomie modułu, dopuszczalna drobna zmiana: rejestr jako funkcja
  przyjmująca config.

## Klient (`src/client/specials/showers.ts`)

Render na canvasie, deterministyczny (parametry `t`, `rng`), styl spójny
z pantry (ciemne tło, emoji, duża typografia).

```
              qWWWη  —  STATUS PRYSZNICÓW
   ┌───────────┬───────────┐   ┌─────────────────┐
   │  qWWWetek │  qWWWetka │   │   WWWIPownia    │
   │    💡on   │    💡off  │   │ „KONFESJONAŁ"   │
   │   [ZAJĘTY]│   [WOLNY] │   │  💡on  ✨preset │
   └───────────┴───────────┘   └─────────────────┘
```

- Trzy kabiny wg fizycznego układu: qWWWetek + qWWWetka sklejone (wspólna
  ściana), WWWIPownia osobno obok, z podpisem „KONFESJONAŁ".
- Dwa niezależne wskaźniki na kabinę:
  - 💡 światło — jasne/pulsujące gdy `on`, przygaszone gdy `off`, `?` gdy
    `unknown`;
  - badge zajętości — `ZAJĘTY` (czerwony) / `WOLNY` (zielony), rysowany tylko
    gdy `occupancy !== 'unknown'`.
- WWWIPownia: animowana ramka LED wokół kabiny gdy `somtasma === 'on'`,
  obok nazwa presetu (jeśli jest).
- Nagłówek: „qWWWη" + podtytuł „STATUS PRYSZNICÓW".
- `previewData` z mieszanką stanów (jeden zajęty, jeden wolny, jeden unknown,
  somtaśma włączona z presetem) → podgląd na `/player?preview=showers`.
- Rejestracja w `src/client/specials/index.ts`.

## Testy (`src/server/specials/showers.test.ts`)

Wzorem `pantry.test.ts`, fake `fetchFn`:

- pełna odpowiedź HA → poprawne mapowanie świateł, somtaśmy i presetu;
- brak encji obecności → `occupancy: 'unknown'`;
- obecna encja obecności `on`/`off` → `occupied`/`free`;
- stan `unavailable` → `unknown`;
- błąd HTTP / wyjątek (timeout) → wszystkie pola `unknown`;
- (config) pusty `HA_TOKEN` → tryb nierejestrowany.

## Poza zakresem

- WebSocket / aktualizacje na żywo w trakcie slajdu (slajd to 15-sekundowa
  migawka).
- Przerywanie odtwarzania przy zmianie statusu prysznica.
- Panel kontrolny — bez zmian (tryb pojawia się w normalnej rotacji specials).
