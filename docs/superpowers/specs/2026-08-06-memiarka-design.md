# Memiarka — projekt systemu

Data: 2026-08-06
Status: zatwierdzony kierunkowo w rozmowie, do przeglądu

## Cel

Strona internetowa wyświetlająca memy (zdjęcia i filmy) z katalogu w losowej kolejności,
zsynchronizowana między wszystkimi klientami jak radio: każdy widzi w danym momencie to samo,
a dołączający w połowie filmu widzi go od połowy. Dodatkowo: reklamy wideo co X elementów,
„tryby specjalne" (animacje generowane z kodu na podstawie danych z zewnętrznych serwisów)
na stałym interwale, baner „NOWY MEM!" dla świeżo wrzuconych plików oraz panel kontrolny.

Środowisko: sieć lokalna (domówka/biuro), bez logowania, kilku–kilkunastu klientów.
Deployment: Docker (docker-compose montuje katalogi z memami i reklamami).

## Architektura

Jeden proces Node.js (TypeScript) pełniący role:

- serwer statycznego frontendu (panel na `/`, odtwarzacz na `/player`),
- serwer mediów przez HTTP z obsługą nagłówka `Range` (wymagane do seekowania wideo),
- serwer WebSocket rozgłaszający stan radia i przyjmujący komendy panelu.

Frontend: vanilla TypeScript budowany Vitem, bez frameworka. Dwie strony: odtwarzacz i panel.

```
memiarka/
├── media/                  ← memy: jpg/png/gif/webp + mp4/webm (wolumen w Dockerze)
├── ads/                    ← reklamy: tylko wideo (wolumen w Dockerze)
├── src/
│   ├── shared/             ← typy protokołu WS i danych trybów specjalnych
│   ├── server/
│   │   ├── library.ts      ← skan + watch katalogów, ffprobe
│   │   ├── radio.ts        ← harmonogram, tasowanie, preempcja, historia
│   │   ├── specials/       ← moduły trybów specjalnych (strona serwerowa)
│   │   └── main.ts         ← HTTP + WS + komendy panelu
│   └── client/
│       ├── player/         ← odtwarzacz (/player)
│       ├── panel/          ← panel (/)
│       └── specials/       ← moduły trybów specjalnych (strona kliencka, canvas)
├── Dockerfile
└── docker-compose.yml      ← przykład z mountami ./memy:/media i ./reklamy:/ads
```

## Komponenty serwera

### MediaLibrary

- Obserwuje `MEDIA_DIR` i `ADS_DIR` przez chokidar z `awaitWriteFinish`
  (żeby nie złapać pliku w połowie kopiowania). Hot-reload bez restartu.
- Katalog memów: obrazki (jpg/png/gif/webp) i wideo (mp4/webm). Katalog reklam: tylko wideo.
- Dla wideo odczytuje długość przez `ffprobe`. Ścieżka do binarki z `FFPROBE_PATH`;
  w dev domyślnie `ffprobe-static`, w obrazie Dockera systemowy `ffprobe` z apk.
- Plik nieczytelny / nieobsługiwany / ffprobe zwraca błąd → plik pomijany, wpis w logu.
- Emituje zdarzenia `added` / `removed` (z rozróżnieniem katalogu).

### Radio (jedyne źródło prawdy)

Stan: `{ bieżący element, startedAt, duration }` + timery. Klienci nie mają własnych
timerów przełączania — zmieniają obraz wyłącznie na komunikat serwera (zero dryfu).

Strumienie treści i priorytety:

1. **Cykl memów** — worek tasujący na zawartości `media/`. Tasowanie całej puli,
   zdejmowanie po kolei, po wyczerpaniu nowe tasowanie — bez powtórek w cyklu.
   Zdjęcie wisi `IMAGE_DURATION` (domyślnie 10 s), film gra do końca swojej długości.
   Film w katalogu memów jest zwykłym elementem cyklu.
2. **Reklamy** — co `AD_INTERVAL` (domyślnie 10) elementów cyklu memów wchodzi jedna
   reklama z własnego, niezależnego worka tasującego na `ads/`. Pusty katalog → reklamy
   nie występują. Nowy plik w `ads/` dołącza do rotacji bez baneru „NOWY MEM!".
3. **Tryby specjalne** — stały interwał `SPECIAL_INTERVAL` (domyślnie 5 min). Po upływie
   interwału tryb wchodzi po zakończeniu bieżącego elementu (nie przerywa w połowie).
   Przy wielu zarejestrowanych trybach — round-robin.
4. **Preempcja „NOWY MEM!"** — nowy plik w `media/` przerywa natychmiast mem lub tryb
   specjalny i gra z flagą `newMem`. **Wyjątek: nie przerywa reklamy** — ustawia się
   w kolejce FIFO i gra zaraz po zakończeniu reklamy (kilka nowych memów w trakcie
   reklamy → kolejka po kolei, każdy z banerem). Przerwany element przepada
   (wróci w kolejnym cyklu tasowania).

Dodatkowo:

- **Historia**: bufor pierścieniowy ostatnich `HISTORY_SIZE` (domyślnie 50) odtworzonych
  elementów: typ (mem / wideo / reklama / tryb specjalny), nazwa pliku lub id trybu,
  czas odtworzenia, flaga `newMem`.
- **Komendy panelu**: `playAd` — natychmiastowa preempcja bieżącego elementu reklamą
  z worka (no-op gdy brak reklam); `stopAd` — jeśli gra reklama, przeskok do następnego
  elementu (najpierw kolejka nowych memów, jeśli niepusta); no-op gdy reklama nie gra.
- **Pusty katalog memów** → stan `idle`, klient pokazuje planszę „wrzuć pliki do ./media".

## Protokół WS i synchronizacja czasu

Po połączeniu i po każdej zmianie stanu serwer wysyła:

```json
{
  "type": "state",
  "item": { "kind": "image|video|ad|special|idle", "url": "...", "specialId": "...", "data": {}, "seed": 123 },
  "startedAt": 1754400000000,
  "duration": 14000,
  "newMem": false,
  "serverNow": 1754400003200
}
```

- Offset zegara: klient wysyła ping WS (`t0` → serwer odpowiada `serverTime` → `t1`),
  `offset = serverTime − (t0 + t1) / 2`, mediana z kilku pomiarów, odświeżana okresowo.
- Dołączający w połowie filmu ustawia `video.currentTime = (now − offset − startedAt) / 1000`.
- Rozłączenie → auto-reconnect z backoffem i ponowna synchronizacja.
- Panel dodatkowo dostaje komunikaty `history` (pełna lista przy połączeniu, potem
  przyrostowo) i wysyła `{ "type": "playAd" }` / `{ "type": "stopAd" }`.

## Klient — odtwarzacz (`/player`)

- Jednorazowy overlay „▶ START": odblokowuje autoplay z dźwiękiem (filmy grają z audio),
  obok przycisk pełnego ekranu.
- Trzy warstwy przełączane wg stanu: `<img>`, `<video>`, `<canvas>`; krótki cross-fade.
- Baner „NOWY MEM!" — animowany overlay nad wszystkim, gdy `newMem: true`.
- Film nie chce się odtworzyć (kodek itp.) → czarny ekran z nazwą pliku do końca slotu;
  czasem steruje serwer, więc nic się nie rozjeżdża.

## Klient — panel (`/`)

- Bez logowania (LAN). Na górze podgląd „teraz gra" na żywo.
- Historia ostatnich X elementów (X konfigurowalne w UI, dane z bufora serwera),
  od najnowszego: miniatura (dla obrazków przeskalowany oryginał, dla wideo znaczek ▶
  + nazwa pliku), typ, godzina, znacznik „NOWY MEM!".
- Przycisk „Odtwórz reklamę teraz" (nieaktywny, gdy katalog reklam pusty) i
  „Przerwij odtwarzanie reklamy" (nieaktywny, gdy reklama nie gra).

## Tryby specjalne — rozszerzalność

Tryb to para modułów spięta wspólnym `id`:

- **Serwer** `src/server/specials/<id>.ts`: `{ id, duration, fetchData(): Promise<Data> }`
  — pobiera dane z timeoutem i fallbackiem; snapshot trafia do komunikatu `state`,
  więc wszyscy klienci renderują identyczną treść (i nie ma problemów z CORS).
- **Klient** `src/client/specials/<id>.ts`: `{ id, render(ctx, t, w, h, data) }` —
  deterministyczna animacja canvas: `t` to zsynchronizowany czas od startu elementu,
  losowość wyłącznie z PRNG seedowanego wartością `seed` z serwera → wszyscy widzą
  tę samą klatkę w tym samym momencie.
- Typ `Data` współdzielony w `src/shared/`. Rejestracja = po jednym wpisie w rejestrze
  serwera i klienta. Planowane rozszerzenie (poza zakresem tej iteracji): status
  zajętości pryszniców.

### Tryb `pantry` („Czy jest ser/mleko/chleb?")

Źródła (odpytywane równolegle, timeout 3 s każde, konfigurowalne przez env):

| Zasób | URL |
|---|---|
| Ser | `http://czyjestser.www22.duck.edu.pl/ser.txt` |
| Mleko | `http://czyjestmleko.www22.duck.edu.pl/mleko.txt` |
| Chleb tostowy | `http://czyjestchlebtostowy.www22.duck.edu.pl/chleb.txt` |

Mapowanie tekstu na status: prefiks „Otóż TAK" → `ok`; prefiks „Już prawie" → `low`;
inny tekst → `out`; błąd pobierania → `unknown`. Surowy tekst też trafia do danych.

Render: plansza z trzema pozycjami (🧀 / 🥛 / 🍞), oryginalny komunikat i animacja
wg statusu — `ok`: spokojne radosne pulsowanie; `low`: żółte ostrzeganie; `out`:
czerwony alarm (miganie, trzęsienie); `unknown`: szary znak zapytania.

## Konfiguracja (env)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `8080` | port HTTP/WS |
| `MEDIA_DIR` | `./media` (`/media` w Dockerze) | katalog memów |
| `ADS_DIR` | `./ads` (`/ads` w Dockerze) | katalog reklam |
| `IMAGE_DURATION` | `10` (s) | czas wyświetlania zdjęcia |
| `AD_INTERVAL` | `10` | reklama co N elementów cyklu |
| `SPECIAL_INTERVAL` | `300` (s) | interwał trybów specjalnych |
| `HISTORY_SIZE` | `50` | rozmiar bufora historii |
| `FFPROBE_PATH` | auto | ścieżka do ffprobe |
| `PANTRY_URL_*` | jw. | URL-e trzech serwisów trybu `pantry` |

## Docker

- Multi-stage Dockerfile: etap build (`npm ci`, build Vite + serwera), etap runtime
  `node:22-alpine` + `apk add ffmpeg` (systemowy ffprobe). Tylko produkcyjne zależności.
- `docker-compose.yml` (przykład): mount `./memy:/media` i `./reklamy:/ads`,
  mapowanie portu, `restart: unless-stopped`.

## Obsługa błędów

- Plik w trakcie kopiowania → `awaitWriteFinish` w chokidarze.
- Usunięcie pliku, który właśnie gra → element dokończy się u klientów, którzy go już
  pobrali; nowi dostaną błąd ładowania i czarny ekran do końca slotu — akceptowalne.
- Serwisy trybu `pantry` niedostępne → status `unknown`, tryb i tak się wyświetla.
- Wszystkie worki puste (brak mediów) → stan `idle`.

## Testy

- Unit (vitest): worek tasujący (brak powtórek, retasowanie), scheduler z fake timers
  (kolejność, licznik reklam, interwał trybów, preempcja NOWY MEM, kolejka podczas
  reklamy, `playAd`/`stopAd`), mapowanie statusów `pantry`, matematyka offsetu zegara.
- E2E ręcznie: dwa okna przeglądarki — zbieżność co do sekundy, dołączenie w połowie
  filmu, wrzucenie pliku w trakcie reklamy.

## Poza zakresem tej iteracji

- Autoryzacja / dostęp publiczny.
- Tryb specjalny „prysznice" (architektura go przewiduje).
- Transkodowanie / generowanie miniatur — panel używa oryginałów.
