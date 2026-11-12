# Tomi Aludec

Przeglądarkowy symulator pracownika formierni w odlewni aluminium. Działa na komputerach i telefonach (Android, iOS).

**Etap 1 (gotowy):** rejestracja i logowanie, kreator postaci z podglądem 3D, szatnia, korytarz i hala formierni w widoku z góry (styl „rysunkowy realizm”), chodzenie (klawiatura albo gałka na telefonie), suwnica z dwoma biegami i fizyką bujania ładunku.

## Technologie

| Część | Narzędzie |
|---|---|
| Grafika 3D | [Three.js](https://threejs.org) (cieniowanie „toon” + tekstury + kontury) |
| Język | TypeScript |
| Budowanie | Vite |
| Serwer, konta, baza danych | Supabase (projekt `tomi-aludec`, region Frankfurt) |
| Testy | Vitest |
| Hosting | Hostinger (gotowe pliki z gałęzi `hostinger`) |

## Budowa modułowa

Gra jest podzielona na niezależne moduły. Moduły nie wołają się nawzajem, tylko ogłaszają **zdarzenia** (`src/core/events.ts`), a dane (wygląd, układ hali, balans) są oddzielone od kodu.

```
src/
  core/        szyna zdarzeń, balans gry (wszystkie liczby w jednym miejscu)
  data/        dane: opcje wyglądu postaci, układ firmy (pomieszczenia, ściany, stanowiska)
  services/    połączenie z serwerem (Supabase) i tryb lokalny do testów
  game/
    render/    tekstury, materiały, pomocnicze funkcje do brył
    world/     budowa świata z danych układu, kolizje
    character/ postać 3D z danych wyglądu
    crane/     fizyka suwnicy (craneSim.ts – bez grafiki, testowana) i jej wygląd
    input/     klawiatura, gałka i przyciski dotykowe
    Game.ts    spina moduły, kamera, pętla gry
  ui/          ekrany logowania i kreatora, HUD
supabase/migrations/  struktura bazy danych
tests/        testy automatyczne
```

Balans (prędkości suwnicy, próg punktów do jej odblokowania, limity) jest w `src/core/balance.ts` i może być nadpisany z tabeli `balance` w Supabase – bez zmiany kodu.

## Uruchomienie u siebie

Potrzebny Node.js 20 lub nowszy.

```bash
npm install
npm run dev        # gra pod http://localhost:5173
npm test           # testy automatyczne
npm run build      # gotowe pliki w folderze dist/
```

Dopisz `?tryb=lokalny` do adresu, żeby grać bez serwera (konto i postać zapisują się tylko w przeglądarce).

## Supabase – jednorazowe ustawienia

W panelu Supabase projektu `tomi-aludec`:

1. **Authentication → URL Configuration**: ustaw *Site URL* na adres gry na Hostingerze (np. `https://twojadomena.pl/`) i dodaj ten adres do *Redirect URLs*. Bez tego link z e-maila potwierdzającego prowadzi pod zły adres.
2. **Authentication → Providers → Email**: na czas testów można wyłączyć *Confirm email*. Wbudowana poczta Supabase wysyła tylko kilka e-maili na godzinę, więc przy wielu rejestracjach warto później podpiąć własny serwer SMTP (*Authentication → Emails → SMTP Settings*).

## Wdrożenie na Hostinger

Po każdym wypchnięciu zmian na gałąź `main` GitHub automatycznie uruchamia testy, buduje grę i zapisuje gotowe pliki na gałęzi `hostinger`.

Jednorazowo w hPanelu Hostingera:

1. **Strony → (Twoja strona) → Zaawansowane → GIT**.
2. Repozytorium: `git@github.com:JogiFPV2/tomi-aludec.git`, gałąź: `hostinger`, katalog: pusty (czyli `public_html`) albo np. `gra`, jeśli gra ma być pod adresem `/gra`.
3. Hostinger pokaże **klucz SSH** – dodaj go w GitHubie: repozytorium → *Settings → Deploy keys → Add deploy key* (bez uprawnień do zapisu).
4. Kliknij **Deploy**. Opcjonalnie włącz automatyczne wdrażanie (webhook) – Hostinger poda adres, który wklejasz w GitHubie w *Settings → Webhooks*.

Alternatywa bez GIT: zbuduj `npm run build` i wgraj zawartość folderu `dist/` przez Menedżer plików do `public_html`.

## Sterowanie

| | Komputer | Telefon |
|---|---|---|
| Chodzenie | W A S D / strzałki, Shift – bieg | gałka w lewym dolnym rogu, przycisk „Bieg” |
| Użyj | E | dotknij podpowiedzi |
| Suwnica: jazda | W A S D | gałka |
| Suwnica: hak | R / F | „Hak ▲” / „Hak ▼” |
| Suwnica: bieg 1/2 | Q | przyciski w panelu |
| Zaczep / odczep | Spacja | przycisk w panelu |
| Odłóż kasetę | Esc | przycisk w panelu |
| Przybliż / oddal | kółko myszy | przyciski + / − |
