# Paski informacyjne w playerze — design

Data: 2026-08-06

## Cel

Player dostaje dwa stałe paski:

- **górny** — przewijany ticker z komunikatami zarządzanymi z panelu,
- **dolny** — status zapasów (ser/mleko/chleb) po lewej i zajętość pryszniców po
  prawej, odświeżany co ~5 s.

Paski zmniejszają obszar sceny (mem/film nie jest zasłaniany). Górny pasek jest
widoczny tylko, gdy lista komunikatów jest niepusta; dolny — zawsze (także przy
idle, reklamach i slajdach specjalnych).

## Architektura

Wszystko idzie istniejącym WebSocketem (`/ws`) — bez nowych kanałów HTTP.

### Serwer

**`src/server/status-poller.ts` — `StatusPoller` (EventEmitter)**

- Co `STATUS_INTERVAL` (domyślnie 5 s) woła równolegle `fetchData()` wszystkich
  specials (pantry, showers) — te same moduły co slajdy specjalne.
- Trzyma ostatni snapshot `{ pantry: PantryData, showers: ShowersData }`
  (per special id).
- Emituje `update` tylko, gdy snapshot różni się od poprzedniego (porównanie po
  serializacji JSON).
- Udostępnia `getData(id)` — źródło danych zarówno dla dolnego paska, jak i dla
  slajdów specjalnych.
- Błąd pojedynczego ticku nie zatrzymuje interwału; `fetchData()` już dziś
  zwraca statusy `unknown` przy niedostępności źródeł.

**`src/server/ticker.ts` — `TickerStore` (EventEmitter)**

- Lista komunikatów `{ id: string, text: string }` (id generowane serwerowo).
- `add(text)` — ignoruje tekst pusty/białe znaki, przycina do 500 znaków;
  `remove(id)`.
- Persystencja: zapis do `DATA_DIR/ticker.json` po każdej zmianie, wczytanie
  przy starcie. Uszkodzony/nieistniejący plik → pusta lista + warning w logu;
  błąd zapisu → warning, lista działa dalej w pamięci.
- Emituje `update` po każdej zmianie.

**Zmiana w `Radio`:** radio nie woła już `fetchData()` przed slajdem
specjalnym. W depsach zamiast pełnych `SpecialMode` dostaje listę
`{ id, duration }` oraz funkcję `getSpecialData(id)` zwracającą snapshot z
pollera (lub `null` — wtedy slajd jest pomijany w tej rundzie). Definicje
specials z `fetchData` przenoszą się do pollera. Podgląd `?preview=` bez zmian.

### Protokół WS (`src/shared/types.ts`)

Serwer → klienci (broadcast przy zmianie + jednorazowo przy połączeniu klienta,
jak dziś `state` i `history`; przed pierwszym udanym tickiem pollera `status`
nie jest wysyłany — player pokazuje wtedy „?"):

```ts
interface StatusMessage {
  type: 'status';
  pantry: PantryData;
  showers: ShowersData;
}
interface TickerMessage {
  type: 'ticker';
  messages: { id: string; text: string }[];
}
```

Panel → serwer:

```ts
interface AddTickerMessage { type: 'addTicker'; text: string; }
interface RemoveTickerMessage { type: 'removeTicker'; id: string; }
```

## Player

**Layout:** `body` jako kolumna flex — górny pasek (auto) / `#stage` (flex: 1)
/ dolny pasek (auto). Media skalują się w pomniejszonej scenie (istniejące
`object-fit: contain`); canvas slajdów specjalnych już mierzy
`clientWidth/clientHeight`, więc działa bez zmian.

**Górny pasek (ticker):**

- Widoczny tylko przy niepustej liście; pusty → `display: none`, scena rośnie.
- Komunikaty sklejone separatorem „ • " w jeden ciąg, przewijany w pętli
  CSS-animacją (treść zduplikowana dla płynnego zapętlenia, stała prędkość w
  px/s — dłuższy tekst przewija się dłużej).
- Zmiana listy podmienia treść natychmiast.
- Wysokość ~5vh, czytelna czcionka na ciemnym tle.

**Dolny pasek:**

- Po lewej zapasy: `🧀 ser · 🥛 mleko · 🍞 chleb`, kolor wg statusu
  (ok = zielony, low = żółty, out = czerwony, unknown = szary „?").
- Po prawej prysznice: `🚿 qWWWetek · qWWWetka · WWWipownia` — status z
  `occupancy` (occupied = czerwony „zajęty", free = zielony „wolny"). Gdy
  `occupancy === 'unknown'` (czujników obecności jeszcze nie ma w HA), fallback
  na stan światła: `light: 'on'` → żółty „zajęty?", `light: 'off'` → zielony
  „wolny?", oba unknown → szary „?".
- Do pierwszej wiadomości `status` pasek pokazuje szare „?".

## Panel

Nowa karta „Pasek informacyjny": pole tekstowe + przycisk „Dodaj", lista
komunikatów z przyciskiem ✕ do usuwania. Bez edycji istniejących wpisów
(usuń + dodaj wystarczy). Renderowana z wiadomości `ticker` (stan zawsze z
serwera, nie lokalny).

## Konfiguracja

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `STATUS_INTERVAL` | `5` | interwał pollingu statusów (s) |
| `DATA_DIR` | `./data` | katalog danych trwałych (ticker.json) |

Do tego: wolumen `./data` w `docker-compose.yml`, aktualizacja README.

## Testy

- `status-poller.test.ts` — interwał (fake timers), emit tylko przy zmianie,
  `getData`, odporność na błąd ticku.
- `ticker.test.ts` — add/remove, trim i limit długości, persystencja,
  wczytanie uszkodzonego pliku.
- `app.test.ts` — snapshot `status`/`ticker` przy połączeniu, obsługa
  `addTicker`/`removeTicker`, broadcast do klientów.
- `radio.test.ts` — aktualizacja pod `getSpecialData` (w tym pominięcie slajdu
  przy `null`).
- Front bez testów jednostkowych (jak dotąd — ręcznie i przez `?preview=`).
