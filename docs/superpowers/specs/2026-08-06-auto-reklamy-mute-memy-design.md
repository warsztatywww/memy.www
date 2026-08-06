# Checkbox „Automatyczne reklamy” + wyciszenie filmów-memów — projekt

Data: 2026-08-06
Status: zatwierdzony w rozmowie

## Cel

Dwie zmiany:

1. **Checkbox „Automatyczne reklamy” w panelu** — odznaczenie wyłącza automatyczne
   wstawianie reklam do rotacji (co `AD_INTERVAL` memów). Guzik „Odtwórz reklamę”
   działa nadal, niezależnie od checkboxa. Ustawienie jest globalne (serwerowe),
   wspólne dla wszystkich paneli i przeżywa restart serwera.
2. **Filmy-memy bez dźwięku** — filmy z katalogu `media/` grają wyciszone;
   reklamy z `ads/` nadal z dźwiękiem. (Dotychczas wszystkie filmy grały z audio.)

## Decyzje (z rozmowy)

- Odznaczenie wyłącza **tylko automat**; ręczne `playAd` z panelu zawsze działa.
- Trwałość: zapis do `DATA_DIR/settings.json` (wzorem `TickerStore`); po restarcie
  kontenera stan checkboxa jest pamiętany. Brak pliku / uszkodzony JSON → domyślnie
  włączone (`true`).
- Dźwięk: wyciszone są wyłącznie filmy-memy; reklamy z audio. Overlay „▶ START”
  zostaje — nadal odblokowuje autoplay z dźwiękiem dla reklam.

## Serwer

### `Radio` (`src/server/radio.ts`)

- Nowe pole `autoAds: boolean` (wartość początkowa przekazywana w depsach)
  i metoda `setAutoAds(enabled)`: zmiana wartości → ustawienie flagi
  i `emit('update')`; ta sama wartość → no-op.
- W `advance()` gałąź reklam pod warunkiem:
  `if (this.autoAds && this.memesSinceAd >= this.config.adInterval)`.
- Licznik `memesSinceAd` rośnie także przy wyłączonym automacie — po ponownym
  włączeniu reklama wchodzi w najbliższym slocie (licznik przekroczył już próg).
- Odznaczenie w trakcie grającej reklamy nie przerywa jej — flaga działa tylko
  na przyszłe sloty.
- `playAdNow()` bez zmian (działa niezależnie od flagi; jak dotąd zeruje licznik).
- `stateMessage()` dodaje pole `autoAds`.

### Store ustawień (`src/server/settings.ts`)

Wzorem `TickerStore`: wczytuje `DATA_DIR/settings.json` o kształcie
`{ "autoAds": boolean }`, zapisuje przy każdej zmianie. Brak pliku, błąd odczytu
lub niepoprawny JSON → wartości domyślne (`autoAds: true`).

### `app.ts`

- Przy starcie: odczyt store'a, przekazanie początkowej wartości do `Radio`.
- Obsługa wiadomości WS `setAutoAds`: walidacja `typeof enabled === 'boolean'`,
  wywołanie `radio.setAutoAds(enabled)` i zapis w store. Broadcast do klientów
  idzie istniejącą ścieżką `radio.emit('update') → broadcast(stateMessage)`.

## Protokół WS (`src/shared/types.ts`)

- `StateMessage` dostaje pole `autoAds: boolean` (obok `adsAvailable`).
- Nowa wiadomość klienta `SetAutoAdsMessage { type: 'setAutoAds'; enabled: boolean }`
  dołączona do unii `ClientMessage`.

## Panel (`src/client/panel/`)

- Checkbox z etykietą „Automatyczne reklamy” w sekcji z guzikami reklam
  (`index.html` + `main.ts`).
- Stan checkboxa ustawiany z serwera przy każdej wiadomości `state`
  (bez localStorage) — wszystkie otwarte panele pokazują to samo.
- Zmiana checkboxa → `conn.send({ type: 'setAutoAds', enabled: checkbox.checked })`.
- Guzik „Odtwórz reklamę” bez zmian (`disabled` wyłącznie gdy `!adsAvailable`).

## Odtwarzacz (`src/client/player/main.ts`)

- W `showVideo()`: `video.muted = state.item.kind !== 'ad'` — filmy-memy
  (w tym te z banerem „NOWY MEM!”) grają bez dźwięku, reklamy z dźwiękiem.
- Tryb podglądu (`?preview=`): fake state uzupełniony o `autoAds: true`
  (wymóg typu `StateMessage`).

## Obsługa błędów

- Uszkodzony / brakujący `settings.json` → domyślne `autoAds: true`, wpis w logu
  co najwyżej ostrzegawczy, serwer startuje normalnie.
- Wiadomość `setAutoAds` z niepoprawnym `enabled` → ignorowana (jak inne
  niepoprawne wiadomości WS).

## Testy

- `radio.test.ts`:
  - wyłączony automat → po `AD_INTERVAL` memach nie wchodzi reklama,
  - ponowne włączenie → reklama w następnym slocie,
  - `setAutoAds` emituje `update`; ta sama wartość → brak emisji,
  - `playAdNow()` działa przy wyłączonym automacie,
  - `stateMessage()` zawiera `autoAds`.
- `settings.test.ts`: wartość domyślna, zapis/odczyt, odporność na uszkodzony plik.
- `app.test.ts`: `setAutoAds` po WS → broadcast stanu z nową wartością;
  wartość odczytywana z pliku przy starcie (przeżywa restart).
- Wyciszenie: kod odtwarzacza nie ma testów jednostkowych — weryfikacja ręczna
  (mem-film gra cicho, reklama z dźwiękiem).

## Poza zakresem

- Inne ustawienia w `settings.json` (struktura jest gotowa na rozszerzenie,
  ale nic więcej nie dodajemy).
- Zmiany w overlayu „▶ START” i sterowaniu głośnością z panelu.
