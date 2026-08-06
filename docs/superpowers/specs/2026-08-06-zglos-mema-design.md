# Zgłoś mema + guzik Skip — projekt

Data: 2026-08-06

## Cel

Możliwość zgłoszenia mema z panelu (`/`): zgłoszony mem ląduje w koszu
(`MEDIA_DIR/trash`) i natychmiast wypada z rotacji; jeśli właśnie gra —
player od razu przeskakuje dalej. Zgłaszający musi wybrać powód z ustalonej
listy (powód wymagany w UI, ale nietrwały — serwer tylko go loguje).

Przy okazji guzik „Przerwij reklamę" zostaje uogólniony do „Skip" —
przeskakuje cokolwiek aktualnie gra.

## Decyzje

- **Miejsce UI:** guzik „Zgłoś" przy „Teraz gra" i przy każdym wpisie
  historii typu mem/wideo.
- **Zgłoszenie grającego mema:** natychmiastowy skip (nie dogrywa do końca).
- **Kosz:** `MEDIA_DIR/trash` — watcher biblioteki skanuje tylko depth 0,
  więc kosz jest dla kolejki niewidoczny; rename w obrębie tego samego
  wolumenu jest atomowy, a w Dockerze kosz siedzi w zamontowanym `./memy`.
- **Kolizja nazw w koszu:** dopisywany sufiks z timestampem, nic nie
  nadpisujemy.
- **Powód:** wymagany w UI (nie da się zgłosić bez wyboru), przesyłany na
  serwer, logowany do konsoli, **nie** zapisywany trwale.
- **Transport:** wiadomość WebSocket (jak `playAd`/`addTicker`) + jawne,
  synchroniczne usunięcie z biblioteki — bez polegania na asynchronicznym
  `unlink` watchera (odrzucono: endpoint HTTP, samo poleganie na watcherze —
  zostawiałoby okno wyścigu, w którym radio może wylosować plik już
  przeniesiony do kosza i player dostaje 404).

## Powody zgłoszenia (stała lista)

1. To nie jest mem
2. Jestem na tym zdjęciu i nie podoba mi się to
3. Nie ma mnie na tym zdjęciu i nie podoba mi się to
4. To jest mem Grzegorza
5. Ten mem jest niezgodny z SOM

Lista zdefiniowana w `src/shared/types.ts` (współdzielona przez panel
i walidację serwera).

## Protokół (`src/shared/types.ts`)

- Nowa wiadomość klienta `{ type: 'report', file: string, reason: string }` —
  `reason` musi być jedną z pozycji stałej listy.
- `{ type: 'stopAd' }` zastąpione przez `{ type: 'skip' }`.
- W `StateMessage` bez zmian.

## Serwer

**`MediaLibrary.remove(file)`** (`src/server/library.ts`): usuwa wpis z mapy
i emituje `removed`; gdy pliku nie ma — nic nie robi (idempotentne, więc
późniejszy `unlink` od chokidara po przeniesieniu pliku jest nieszkodliwy —
obecny handler `unlink` już emituje tylko przy faktycznym usunięciu z mapy).

**`Radio.skip()`** (`src/server/radio.ts`): zastępuje `stopAd()` —
przy czymkolwiek innym niż `idle` woła `advance()`; przy `idle` nic nie robi.

**`Radio.dropQueued(file)`**: usuwa plik z `newMemQueue` (na wypadek
zgłoszenia świeżego mema czekającego za reklamą).

**Handler `report` w `app.ts`:**

1. walidacja: `file` jest stringiem, `reason` z listy, plik istnieje
   w bibliotece memów — inaczej wiadomość zignorowana (jak przy innych
   niepoprawnych wiadomościach WS; obejmuje to podwójne zgłoszenie tego
   samego pliku z dwóch paneli);
2. `mkdir -p MEDIA_DIR/trash` (przy starcie aplikacji, obok istniejących
   `mkdirSync`);
3. `rename(MEDIA_DIR/<file> → MEDIA_DIR/trash/<file>)`; gdy cel istnieje —
   `MEDIA_DIR/trash/<timestamp>-<file>`; błąd rename → log ostrzeżenia,
   nic więcej nie robimy;
4. `memes.remove(file)` — mem od razu wypada z shuffle-baga
   (istniejący listener `removed` → `syncBags()`);
5. `radio.dropQueued(file)`;
6. jeśli `radio` właśnie gra ten plik (stan `image`/`video` z tą nazwą) —
   `radio.skip()`;
7. log do konsoli: nazwa pliku + powód.

Handler `stopAd` w WS zastąpiony przez `skip` → `radio.skip()`.

## Panel

**HTML (`src/client/index.html`):**

- guzik „Przerwij reklamę" → „Skip";
- `<dialog id="report-dialog">` z nagłówkiem „Zgłoś mema", nazwą pliku,
  pięcioma guzikami powodów i guzikiem „Anuluj".

**Logika (`src/client/panel/main.ts`):**

- „Skip" aktywny, gdy gra cokolwiek (`kind !== 'idle'`); wysyła
  `{ type: 'skip' }`;
- guzik „Zgłoś" w „Teraz gra" (tylko dla `image`/`video`) i przy wpisach
  historii typu `image`/`video`; klik otwiera dialog z zapamiętaną nazwą
  pliku;
- klik powodu → `conn.send({ type: 'report', file, reason })` + zamknięcie
  dialogu; „Anuluj" (i Esc) zamyka bez wysyłania;
- wpisy historii zgłoszonego pliku zostają (historia to zapis „co grało");
  ponowne zgłoszenie pliku, którego już nie ma, serwer po prostu ignoruje;
  miniatura w historii przestanie się ładować po przeniesieniu pliku —
  akceptowalne (istniejące zachowanie przy ręcznym usunięciu pliku).

Potwierdzeniem zgłoszenia jest zniknięcie mema z playera/rotacji —
bez osobnego komunikatu zwrotnego.

## Obsługa błędów

- report na plik spoza biblioteki (już zgłoszony, literówka, reklama,
  tryb specjalny) → zignorowany;
- `reason` spoza listy → zignorowany;
- błąd `rename` (np. plik zniknął między walidacją a przeniesieniem) →
  log ostrzeżenia, biblioteka nietknięta;
- kolizja nazwy w koszu → sufiks z timestampem.

## Testy

- `library.test.ts`: `remove()` usuwa wpis i emituje `removed`; `remove()`
  nieznanego pliku nic nie emituje.
- `radio.test.ts`: `skip()` przeskakuje mema, reklamę i tryb specjalny;
  przy `idle` nic nie robi; `dropQueued()` usuwa mem z kolejki nowych.
- `app.test.ts` (prawdziwy serwer + katalog tymczasowy): report przenosi
  plik do `MEDIA_DIR/trash` i mem znika z rotacji; report grającego mema
  natychmiast zmienia stan; report nieznanego pliku / złego powodu nie
  zmienia niczego; kolizja nazwy w koszu tworzy plik z sufiksem;
  wiadomość `skip` przerywa bieżący element.

## Poza zakresem

- trwały rejestr zgłoszeń i powodów;
- UI do przeglądania/przywracania kosza (przywracanie = ręczne przeniesienie
  pliku z powrotem, watcher go podchwyci);
- automatyczne czyszczenie kosza;
- autoryzacja (panel w zaufanej sieci — jak dotychczas).
