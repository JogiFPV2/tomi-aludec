# Tomi Aludec – wskazówki dla pracy nad kodem

- Język interfejsu i komunikatów: **polski**. Komentarze w kodzie po polsku.
- Gra przeglądarkowa: Three.js + TypeScript + Vite, backend Supabase (projekt `rhvqjlpcpjvopkikafkb`, region eu-central-1).
- Architektura modułowa: moduły komunikują się przez `EventBus` (`src/core/events.ts`), nie przez bezpośrednie wywołania. Dane (układ, wygląd, metale, modele) w `src/data` lub w bazie, nie w kodzie mechanik. Liczby balansu tylko w `src/core/balance.ts` / tabeli `balance`.
- Logika bez grafiki (np. `game/crane/craneSim.ts`) trzymana osobno i pokryta testami w `tests/`.
- Kamera: widok z góry, ortograficzna; pochylenie 12–60° z ustawień gracza (`src/core/settings.ts`, menu w `src/ui/menu.ts`). Styl graficzny: rysunkowy – `MeshToonMaterial` (3 tony) + kontur `OutlineEffect`, karykaturalne postacie z dużą głową, dynamiczne światło (`render/atmosphere.ts`: lampy, żar z kadzi, iskry) i papierowe ziarno.
- Transport (palety, paleciaki): `src/game/transport` – logika stosów w `stacking.ts` (testy), reszta w `transport.ts`.
- Metale: skrzynie w `src/data/layout.ts` (`METAL_BOXES`), logika w `src/game/metals/box.ts` (testy), ekran przekładania `src/ui/screens/metals.ts`; metale jadą na palecie (`StackV.metals`) i dopiero z palety przy stanowisku trafiają do modelu (ekran sypania). Samouczek: `src/ui/tutorial.ts`.
- Hala: wymiary w `src/data/layout.ts` (`HALL`, `CRANE_BAY_D` – północna nawa z suwnicami, południowa: transport i malarnia). Malarnia rdzeni: `src/game/paint` (logika `paint.ts` z testami, świat `shop.ts`), ekran `src/ui/screens/paint.ts`. Malowanie tylko przy maszynach malujących (`PAINT.machines` w `layout.ts`): forma na palecie na żółtym polu maszyny, gracz przy pulpicie → tryb malowania. Pomalowana forma zmienia kolor całego bloku (świeża farba jasnoszara, wypalona stalowoszara).
- Instrukcja modelu z limitem podglądów: `src/game/instruction/limit.ts`, `src/ui/instruction.ts`; przełącznik admina to `balance.instructions.limitEnabled` (tabela `balance`). Zegar gry (czas serwera, zmiany): `src/core/clock.ts`.
- Menu główne po zalogowaniu: `src/ui/screens/mainMenu.ts` (gra, postacie, kreator, ustawienia). Kilka postaci na konto (maks. 5, `is_active` w tabeli `characters`, RPC `set_active_character`).
- Multitouch przycisków: `src/ui/multitouch.ts` (przycisk działa na podniesienie palca; przyciski z własną obsługą dotyku: `.hold`, `.mtile`, `data-touch-own`).
- Dźwięk: `src/game/audio/hall.ts` (Web Audio, generowany; nagranie wołania `public/assets/audio/wolanie-e.mp3`), głośność w ustawieniach.
- **Wdrażanie: tylko na tomi.mypinsy.com** (gałąź `hostinger` → katalog `public_html/tomi`). Nigdy nie ustawiaj wdrażania tego repozytorium na mypinsy.com – to osobna strona.
- Musi działać na telefonach: przyciski min. 44 px, sterowanie dotykowe, niższa jakość na urządzeniach dotykowych.
- Przed wypchnięciem: `npm test` i `npm run build`. Tryb lokalny do testów: `?tryb=lokalny`.
- Pełne założenia gry: dokument „Założenia gry” w projekcie Claude (Alutec Game).
