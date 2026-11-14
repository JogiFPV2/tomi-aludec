# Tomi Aludec – wskazówki dla pracy nad kodem

- Język interfejsu i komunikatów: **polski**. Komentarze w kodzie po polsku.
- Gra przeglądarkowa: Three.js + TypeScript + Vite, backend Supabase (projekt `rhvqjlpcpjvopkikafkb`, region eu-central-1).
- Architektura modułowa: moduły komunikują się przez `EventBus` (`src/core/events.ts`), nie przez bezpośrednie wywołania. Dane (układ, wygląd, metale, modele) w `src/data` lub w bazie, nie w kodzie mechanik. Liczby balansu tylko w `src/core/balance.ts` / tabeli `balance`.
- Logika bez grafiki (np. `game/crane/craneSim.ts`) trzymana osobno i pokryta testami w `tests/`.
- Kamera: widok z góry pochylony 15°, ortograficzna. Styl graficzny: rysunkowy – `MeshToonMaterial` (3 tony) + kontur `OutlineEffect`, karykaturalne postacie z dużą głową, dynamiczne światło (`render/atmosphere.ts`: lampy, żar z kadzi, iskry) i papierowe ziarno.
- Transport (palety, paleciaki): `src/game/transport` – logika stosów w `stacking.ts` (testy), reszta w `transport.ts`.
- Musi działać na telefonach: przyciski min. 44 px, sterowanie dotykowe, niższa jakość na urządzeniach dotykowych.
- Przed wypchnięciem: `npm test` i `npm run build`. Tryb lokalny do testów: `?tryb=lokalny`.
- Pełne założenia gry: dokument „Założenia gry” w projekcie Claude (Alutec Game).
