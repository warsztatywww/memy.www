# Memiarka

Zsynchronizowane „radio memowe": wszyscy klienci widzą w tym samym momencie ten sam
mem / film / reklamę / tryb specjalny. Panel kontrolny na `/`, odtwarzacz na `/player`.

## Szybki start (dev)

Wymagania: Node 22+, `ffprobe` w PATH (pakiet ffmpeg).

```bash
npm install
HA_TOKEN=<token> npm run dev        # vite build --watch + tsx watch
# panel:  http://localhost:8080/
# player: http://localhost:8080/player
```

Memy wrzucaj do `./media` (jpg/png/gif/webp/mp4/webm) — albo przez panel:
drag&drop na stronę lub guzik „Wybierz pliki" w sekcji „Wrzuć mema".
Reklamy (wideo) wrzucaj do `./ads`.
Nowy plik w `./media` przerywa odtwarzanie i leci z banerem „NOWY MEM!"
(chyba że gra reklama — wtedy zaraz po niej).

## Docker

```bash
docker compose up -d --build
```

`docker-compose.yml` montuje `./memy` → `/media`, `./reklamy` → `/ads` i `./data` → `/data`.

## Konfiguracja (env)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `HA_TOKEN` | — (wymagany) | token Home Assistanta (slajd statusu pryszniców) |
| `PORT` | `8080` | port HTTP/WS |
| `MEDIA_DIR` | `./media` | katalog memów |
| `ADS_DIR` | `./ads` | katalog reklam (tylko wideo) |
| `IMAGE_DURATION` | `10` | czas zdjęcia w sekundach |
| `AD_INTERVAL` | `10` | reklama co N elementów |
| `SPECIAL_INTERVAL` | `300` | interwał trybów specjalnych (s) |
| `HISTORY_SIZE` | `50` | rozmiar historii w panelu |
| `STATUS_INTERVAL` | `5` | interwał odświeżania pasków statusu (s) |
| `DATA_DIR` | `./data` | katalog danych trwałych (komunikaty tickera) |

## Tryby specjalne

Tryb = para modułów o wspólnym `id`:
`src/server/specials/<id>.ts` (`fetchData()` — dane) +
`src/client/specials/<id>.ts` (`render(ctx, t, w, h, data, rng)` — deterministyczna
animacja canvas) + wpis w obu rejestrach (`specials/index.ts`).
Podgląd bez czekania na interwał: `http://localhost:8080/player?preview=<id>`.

## Paski w playerze

Górny pasek to przewijany ticker — komunikaty dodaje się i usuwa w panelu
(sekcja „Pasek informacyjny"); lista jest trwała (`DATA_DIR/ticker.json`),
pusta lista ukrywa pasek. Dolny pasek pokazuje status zapasów (ser/mleko/chleb)
i zajętość pryszniców — serwer odpytuje źródła co `STATUS_INTERVAL` sekund
i wypycha zmiany do playerów po WebSockecie. Zajętość bierze się z czujników PIR
w Home Assistancie („zajęty"/„wolny"); gdy czujnik nie odpowiada, zgaduje się ze
stanu światła („zajęty?"/„wolny?").

## Testy

```bash
npm test
```
