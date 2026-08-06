# Upload memów z panelu — projekt

Data: 2026-08-06

## Cel

Możliwość wrzucania memów bezpośrednio z panelu (`/`) przez drag&drop na całej
stronie oraz przez guzik wyboru plików. Upload reklam poza zakresem (ale kod
zapisu pisany tak, by dało się później podać inny katalog docelowy).

## Decyzje

- **Kolizja nazw:** odrzucamy z błędem (`409`), użytkownik sam decyduje, co dalej.
- **Wiele plików naraz:** tak — drag&drop i selektor przyjmują wiele plików,
  wynik pokazywany per plik.
- **Limit rozmiaru:** brak.
- **UX:** drop działa na całej stronie panelu (overlay „upuść, by wrzucić mema")
  + dedykowana sekcja „Wrzuć mema" z guzikiem i listą wyników.
- **Transport:** osobny `POST` per plik ze streamowanym surowym body — zero
  nowych zależności (odrzucono: multer/multipart, upload przez WebSocket).

## Architektura

Upload to endpoint HTTP zapisujący plik do `MEDIA_DIR`. Całą resztę robi
istniejący pipeline: watcher `MediaLibrary` (chokidar) wykrywa nowy plik,
`Radio` przerywa odtwarzanie i gra go z banerem „NOWY MEM!". Protokół
WebSocket bez zmian.

## Serwer

Nowy moduł `src/server/upload.ts` (walidacja + zapis atomowy jako testowalna
jednostka), podpięty w `src/server/app.ts`.

**Endpoint:** `POST /api/upload?name=<nazwa-pliku>` — nazwa URL-encoded
w query, body to surowa zawartość pliku.

**Walidacja nazwy** (czysta funkcja, testy jednostkowe):

- po `basename()` nazwa musi być identyczna z podaną (żadnych separatorów
  ścieżek — blokada path traversal);
- nazwa nie może zaczynać się od kropki;
- rozszerzenie z listy `jpg/jpeg/png/gif/webp/mp4/webm` — te same zestawy
  `IMAGE_EXT`/`VIDEO_EXT` co w `library.ts` (wyeksportować, nie duplikować).

**Zapis:**

- kolizja: jeśli plik o tej nazwie istnieje w `MEDIA_DIR` → `409`, nic nie
  zapisujemy;
- streaming `req` → `fs.createWriteStream` do `<nazwa>.tmp` w `MEDIA_DIR`
  (chokidar ignoruje `.tmp` — nie przechodzi filtra rozszerzeń), po
  zakończeniu ponowne sprawdzenie istnienia i atomiczny `rename` na docelową
  nazwę (wystarczające przy tej skali równoczesności);
- przerwany request → usunięcie `.tmp`, nic nie trafia do biblioteki;
- po `rename` nic więcej — watcher robi resztę.

**Odpowiedzi:** `201` sukces, `400` zła nazwa/rozszerzenie, `409` kolizja,
`500` błąd zapisu.

## Panel

**HTML** (`src/client/index.html`): sekcja „Wrzuć mema" między „Teraz gra"
a „Pasek informacyjny" — ramka-dropzone z podpisem „przeciągnij pliki tutaj
albo" + guzik „Wybierz pliki" (ukryty `<input type="file" multiple>` z
`accept` na obsługiwane rozszerzenia), pod spodem lista wyników uploadu.

**Logika** — nowy moduł `src/client/panel/upload.ts` (nie dokładamy piątej
odpowiedzialności do `main.ts`):

- drag&drop na całej stronie: `dragenter/dragover` z plikami na `window` →
  pełnoekranowy overlay „upuść, by wrzucić mema"; `drop` gdziekolwiek →
  upload; `dragleave` poza okno / `drop` → overlay znika;
- filtr rozszerzeń po stronie klienta — złe pliki od razu na listę jako błąd,
  bez requestu;
- wysyłka przez `XMLHttpRequest` (progres wysyłania), **sekwencyjnie** —
  jeden plik naraz, reszta w kolejce ze statusem „w kolejce";
- lista wyników: per plik nazwa + status („w kolejce", „wysyłanie…" z
  procentem, „✓ wrzucony", „✗ plik o tej nazwie już istnieje",
  „✗ nieobsługiwany typ pliku", „✗ błąd wysyłania"); lista dotyczy bieżącej
  sesji panelu (nietrwała); wpisy sukcesu znikają po kilku sekundach, błędy
  zostają do zamknięcia przez użytkownika.

Potwierdzeniem uploadu jest też pojawienie się mema w „Teraz gra" z banerem
„NOWY MEM!" (istniejący mechanizm).

## Obsługa błędów

- przerwane połączenie w trakcie wysyłania → serwer sprząta `.tmp`, panel
  pokazuje „✗ błąd wysyłania" i przechodzi do kolejnego pliku z kolejki;
- mieszany drop (poprawne + niepoprawne rozszerzenia) → poprawne się
  wysyłają, niepoprawne dostają wpis błędu bez requestu;
- pusty plik (0 bajtów) przechodzi — jak przy dzisiejszym ręcznym wrzuceniu;
  uszkodzone wideo odfiltruje istniejący `ffprobe` w `MediaLibrary` (plik
  zostaje na dysku, nie wchodzi do rotacji — bez zmian względem obecnego
  zachowania);
- równoczesny upload tej samej nazwy z dwóch paneli: sprawdzenie istnienia
  tuż przed `rename` (świadomie bez pełnej atomiczności).

## Testy

Vitest, wzorem `app.test.ts` (prawdziwy serwer HTTP na katalogu tymczasowym):

- upload poprawnego obrazka → `201`, plik w `MEDIA_DIR`, biblioteka go
  wykrywa;
- kolizja nazwy → `409`, oryginalny plik nietknięty;
- path traversal (`../evil.jpg`), nazwa z kropką na początku
  (`.ukryty.jpg`), złe rozszerzenie → `400`, nic nie zapisane;
- przerwany request → brak pliku `.tmp` i docelowego;
- walidacja nazwy: osobne testy jednostkowe czystej funkcji.

## Poza zakresem

- upload reklam (przygotowany tylko przez parametryzację katalogu w kodzie
  zapisu);
- limit rozmiaru pliku;
- trwała historia uploadów;
- autoryzacja (panel działa w zaufanej sieci — jak dotychczas).
