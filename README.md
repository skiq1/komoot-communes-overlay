# ZaliczGmine.pl - nakładka na mapy

Rozszerzenie wyświetla zaliczone i niezaliczone gminy w Polsce na mapach **Komoot** i **VeloPlanner**. Pomaga planować trasy przez nowe gminy na podstawie danych wybranego konta ZaliczGmine.pl. Pozwala też dodać własne ślady GPX.

## Instalacja

Rozszerzenie ładuje się lokalnie w przeglądarce opartej na Chromium (np. Chrome lub Edge).

1. Pobierz repozytorium jako ZIP i rozpakuj je lub sklonuj przez Git.
2. Otwórz `chrome://extensions` (Chrome) lub `edge://extensions` (Edge).
3. Włącz **Tryb dewelopera**.
4. Kliknij **Załaduj rozpakowane** i wybierz katalog zawierający `manifest.json`.
5. Przypnij rozszerzenie do paska narzędzi i odśwież otwarte karty planerów.

Po aktualizacji plików kliknij przycisk przeładowania rozszerzenia na stronie rozszerzeń, a następnie odśwież planer.

## Konfiguracja

1. Otwórz [planer Komoot](https://www.komoot.com/plan) lub [VeloPlanner](https://veloplanner.com/pl/plan).
2. Kliknij ikonę rozszerzenia.
3. W sekcji **Konto ZaliczGmine.pl** wpisz nick lub ID użytkownika i kliknij **Szukaj**.
4. Wybierz konto z listy wyników. Rozszerzenie zapisze wybór i pobierze zaliczone gminy — nie podajesz hasła ani klucza API.

Aby zmienić konto, wyszukaj i wybierz inne. Panel pokazuje liczbę zaliczonych gmin oraz stan połączenia z mapą aktywnej karty.

## Korzystanie

Nakładka działa w widoku planowania i edycji tras.

| Kolor na mapie | Znaczenie |
| --- | --- |
| Zielone gminy | Zaliczone przez wybranego użytkownika (aktualnie niewyświetlane) |
| Czerwone gminy | Niezaliczone |
| Niebieskie gminy | Niezaliczone gminy przecinane przez aktualną trasę planera |
| Niebieskie linie | Ślady GPX dodane przez rozszerzenie |

- Planuj trasę jak zwykle — podświetlenie przecinanych gmin aktualizuje się automatycznie po zmianie trasy.
- Przycisk **Ukryj gminy / Pokaż gminy** przełącza widoczność warstw gmin.
- Aby pobrać aktualny stan zaliczeń po zmianach w ZaliczGmine.pl, odśwież stronę planera.

### Własne pliki GPX

W panelu rozwiń **Trasy GPX**, kliknij **Wybierz**, wskaż plik `.gpx` i wybierz **Dodaj trasę**. Możesz dodać kilka plików, usuwać je pojedynczo przyciskiem **Usuń** lub wybrać **Usuń wszystkie**.

Pliki są zapamiętywane lokalnie i ponownie wyświetlane po otwarciu planera. GPX jest dodatkowym śladem na mapie: nie staje się edytowalną trasą planera i nie uruchamia podświetlania przecinanych gmin.


## Dane i uprawnienia

Wybrane konto i pliki GPX są przechowywane w lokalnej pamięci rozszerzenia (`chrome.storage.local`). Rozszerzenie odczytuje dane z API ZaliczGmine.pl, przesyłając m.in. zapytanie wyszukiwania, ID użytkownika oraz granice obszaru mapy lub trasy. GPX jest przetwarzany lokalnie i udostępniany stronie planera do wyświetlenia.

Uprawnienia obejmują zapis ustawień oraz dostęp do obsługiwanych planerów i ZaliczGmine.pl.

## Biblioteki i licencje

Rozszerzenie korzysta z następujących projektów open source:

| Biblioteka | Zastosowanie | Licencja |
| --- | --- | --- |
| [Turf.js 6.5.0](https://github.com/Turfjs/turf/tree/v6.5.0) | Adaptowane fragmenty algorytmów sprawdzających przecięcia trasy z gminami | MIT |
| [mapbox/togeojson](https://github.com/mapbox/togeojson) | Konwersja plików GPX do GeoJSON wyświetlanego na mapie | BSD-2-Clause |

Pełne treści licencji i informacje o autorach znajdują się w [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt). Plik należy dołączać do rozpowszechnianych kopii rozszerzenia.
