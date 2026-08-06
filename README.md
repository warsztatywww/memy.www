# Memiarka

Zsynchronizowane „radio memowe": wszyscy klienci widzą w tym samym momencie ten sam
mem / film / reklamę / tryb specjalny. Panel kontrolny na `/`, odtwarzacz na `/player`.

## Szybki start (dev)

Wymagania: Node 22+, `ffprobe` w PATH (pakiet ffmpeg).

```bash
npm install
npm run dev        # vite build --watch + tsx watch
# panel:  http://localhost:8080/
# player: http://localhost:8080/player
```

Memy wrzucaj do `./media` (jpg/png/gif/webp/mp4/webm), reklamy (wideo) do `./ads`.
Nowy plik w `./media` przerywa odtwarzanie i leci z banerem „NOWY MEM!"
(chyba że gra reklama — wtedy zaraz po niej).

## Docker

```bash
docker compose up -d --build
```

`docker-compose.yml` montuje `./memy` → `/media` i `./reklamy` → `/ads`.

## Konfiguracja (env)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `8080` | port HTTP/WS |
| `MEDIA_DIR` | `./media` | katalog memów |
| `ADS_DIR` | `./ads` | katalog reklam (tylko wideo) |
| `IMAGE_DURATION` | `10` | czas zdjęcia w sekundach |
| `AD_INTERVAL` | `10` | reklama co N elementów |
| `SPECIAL_INTERVAL` | `300` | interwał trybów specjalnych (s) |
| `HISTORY_SIZE` | `50` | rozmiar historii w panelu |

## Tryby specjalne

Tryb = para modułów o wspólnym `id`:
`src/server/specials/<id>.ts` (`fetchData()` — dane) +
`src/client/specials/<id>.ts` (`render(ctx, t, w, h, data, rng)` — deterministyczna
animacja canvas) + wpis w obu rejestrach (`specials/index.ts`).
Podgląd bez czekania na interwał: `http://localhost:8080/player?preview=<id>`.

## Testy

```bash
npm test
```
