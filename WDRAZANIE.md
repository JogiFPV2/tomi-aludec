# Wdrażanie gry Tomi Aludec

**Gra wdraża się wyłącznie na `tomi.mypinsy.com`.** Strona `mypinsy.com` to osobny projekt (inne repozytorium) i to repozytorium nie może być do niej podpięte.

## Jak to działa
1. Wypchnięcie na gałąź `main` uruchamia GitHub Actions: testy → budowa → pliki gry na gałąź `hostinger`.
2. Hostinger pobiera gałąź `hostinger` do strony **tomi.mypinsy.com** (katalog `public_html/tomi` na koncie `u980737058`).
3. Workflow sprawdza plik `wersja.json`: nowa wersja musi być na `tomi.mypinsy.com` i nie może pojawić się na `mypinsy.com` – inaczej wdrożenie kończy się błędem.
4. Workflow „Straż” co 6 godzin sprawdza, czy gra działa, a gdy nie – wdraża ją ponownie (pusty zapis na gałęzi `hostinger`).

## Układ katalogów na serwerze
```
public_html/          ← strona mypinsy.com (inny projekt)
public_html/tomi/     ← gra (to repozytorium)
```
Katalog gry leży wewnątrz katalogu strony głównej, dlatego:
- strona główna nie może mieć u siebie pliku ani katalogu o nazwie `tomi`,
- wgrywanie strony głównej nie może czyścić całego `public_html` (wdrażanie z GIT zostawia pliki, których nie ma w repozytorium – więc `tomi` zostaje),
- `.htaccess` gry ma własne reguły przepisywania, żeby reguły strony głównej nie działały w grze.

## Czego nie robić
- Nie ustawiać wdrażania repozytorium `tomi-aludec` na domenie `mypinsy.com`.
- Nie wgrywać gry archiwum do `public_html` strony głównej.
