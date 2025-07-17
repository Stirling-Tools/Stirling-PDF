# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Poprzednia strona
pdfjs-previous-button-label = Poprzednia
pdfjs-next-button =
    .title = Następna strona
pdfjs-next-button-label = Następna
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Strona
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = z { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } z { $pagesCount })
pdfjs-zoom-out-button =
    .title = Pomniejsz
pdfjs-zoom-out-button-label = Pomniejsz
pdfjs-zoom-in-button =
    .title = Powiększ
pdfjs-zoom-in-button-label = Powiększ
pdfjs-zoom-select =
    .title = Skala
pdfjs-presentation-mode-button =
    .title = Przełącz na tryb prezentacji
pdfjs-presentation-mode-button-label = Tryb prezentacji
pdfjs-open-file-button =
    .title = Otwórz plik
pdfjs-open-file-button-label = Otwórz
pdfjs-print-button =
    .title = Drukuj
pdfjs-print-button-label = Drukuj
pdfjs-save-button =
    .title = Zapisz
pdfjs-save-button-label = Zapisz
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Pobierz
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Pobierz
pdfjs-bookmark-button =
    .title = Bieżąca strona (adres do otwarcia na bieżącej stronie)
pdfjs-bookmark-button-label = Bieżąca strona
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Otwórz w aplikacji
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Otwórz w aplikacji

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Narzędzia
pdfjs-tools-button-label = Narzędzia
pdfjs-first-page-button =
    .title = Przejdź do pierwszej strony
pdfjs-first-page-button-label = Przejdź do pierwszej strony
pdfjs-last-page-button =
    .title = Przejdź do ostatniej strony
pdfjs-last-page-button-label = Przejdź do ostatniej strony
pdfjs-page-rotate-cw-button =
    .title = Obróć zgodnie z ruchem wskazówek zegara
pdfjs-page-rotate-cw-button-label = Obróć zgodnie z ruchem wskazówek zegara
pdfjs-page-rotate-ccw-button =
    .title = Obróć przeciwnie do ruchu wskazówek zegara
pdfjs-page-rotate-ccw-button-label = Obróć przeciwnie do ruchu wskazówek zegara
pdfjs-cursor-text-select-tool-button =
    .title = Włącz narzędzie zaznaczania tekstu
pdfjs-cursor-text-select-tool-button-label = Narzędzie zaznaczania tekstu
pdfjs-cursor-hand-tool-button =
    .title = Włącz narzędzie rączka
pdfjs-cursor-hand-tool-button-label = Narzędzie rączka
pdfjs-scroll-page-button =
    .title = Przewijaj strony
pdfjs-scroll-page-button-label = Przewijanie stron
pdfjs-scroll-vertical-button =
    .title = Przewijaj dokument w pionie
pdfjs-scroll-vertical-button-label = Przewijanie pionowe
pdfjs-scroll-horizontal-button =
    .title = Przewijaj dokument w poziomie
pdfjs-scroll-horizontal-button-label = Przewijanie poziome
pdfjs-scroll-wrapped-button =
    .title = Strony dokumentu wyświetlaj i przewijaj w kolumnach
pdfjs-scroll-wrapped-button-label = Widok dwóch stron
pdfjs-spread-none-button =
    .title = Nie ustawiaj stron obok siebie
pdfjs-spread-none-button-label = Brak kolumn
pdfjs-spread-odd-button =
    .title = Strony nieparzyste ustawiaj na lewo od parzystych
pdfjs-spread-odd-button-label = Nieparzyste po lewej
pdfjs-spread-even-button =
    .title = Strony parzyste ustawiaj na lewo od nieparzystych
pdfjs-spread-even-button-label = Parzyste po lewej

## Document properties dialog

pdfjs-document-properties-button =
    .title = Właściwości dokumentu…
pdfjs-document-properties-button-label = Właściwości dokumentu…
pdfjs-document-properties-file-name = Nazwa pliku:
pdfjs-document-properties-file-size = Rozmiar pliku:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } B)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } B)
pdfjs-document-properties-title = Tytuł:
pdfjs-document-properties-author = Autor:
pdfjs-document-properties-subject = Temat:
pdfjs-document-properties-keywords = Słowa kluczowe:
pdfjs-document-properties-creation-date = Data utworzenia:
pdfjs-document-properties-modification-date = Data modyfikacji:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Utworzony przez:
pdfjs-document-properties-producer = PDF wyprodukowany przez:
pdfjs-document-properties-version = Wersja PDF:
pdfjs-document-properties-page-count = Liczba stron:
pdfjs-document-properties-page-size = Wymiary strony:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = pionowa
pdfjs-document-properties-page-size-orientation-landscape = pozioma
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = US Letter
pdfjs-document-properties-page-size-name-legal = US Legal

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width }×{ $height } { $unit } (orientacja { $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width }×{ $height } { $unit } ({ $name }, orientacja { $orientation })

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = Szybki podgląd w Internecie:
pdfjs-document-properties-linearized-yes = tak
pdfjs-document-properties-linearized-no = nie
pdfjs-document-properties-close-button = Zamknij

## Print

pdfjs-print-progress-message = Przygotowywanie dokumentu do druku…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Anuluj
pdfjs-printing-not-supported = Ostrzeżenie: drukowanie nie jest w pełni obsługiwane przez tę przeglądarkę.
pdfjs-printing-not-ready = Ostrzeżenie: dokument PDF nie jest całkowicie wczytany, więc nie można go wydrukować.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Przełącz panel boczny
pdfjs-toggle-sidebar-notification-button =
    .title = Przełącz panel boczny (dokument zawiera konspekt/załączniki/warstwy)
pdfjs-toggle-sidebar-button-label = Przełącz panel boczny
pdfjs-document-outline-button =
    .title = Konspekt dokumentu (podwójne kliknięcie rozwija lub zwija wszystkie pozycje)
pdfjs-document-outline-button-label = Konspekt dokumentu
pdfjs-attachments-button =
    .title = Załączniki
pdfjs-attachments-button-label = Załączniki
pdfjs-layers-button =
    .title = Warstwy (podwójne kliknięcie przywraca wszystkie warstwy do stanu domyślnego)
pdfjs-layers-button-label = Warstwy
pdfjs-thumbs-button =
    .title = Miniatury
pdfjs-thumbs-button-label = Miniatury
pdfjs-current-outline-item-button =
    .title = Znajdź bieżący element konspektu
pdfjs-current-outline-item-button-label = Bieżący element konspektu
pdfjs-findbar-button =
    .title = Znajdź w dokumencie
pdfjs-findbar-button-label = Znajdź
pdfjs-additional-layers = Dodatkowe warstwy

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = { $page }. strona
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura { $page }. strony

## Find panel button title and messages

pdfjs-find-input =
    .title = Znajdź
    .placeholder = Znajdź w dokumencie…
pdfjs-find-previous-button =
    .title = Znajdź poprzednie wystąpienie tekstu
pdfjs-find-previous-button-label = Poprzednie
pdfjs-find-next-button =
    .title = Znajdź następne wystąpienie tekstu
pdfjs-find-next-button-label = Następne
pdfjs-find-highlight-checkbox = Wyróżnianie wszystkich
pdfjs-find-match-case-checkbox-label = Rozróżnianie wielkości liter
pdfjs-find-match-diacritics-checkbox-label = Rozróżnianie liter diakrytyzowanych
pdfjs-find-entire-word-checkbox-label = Całe słowa
pdfjs-find-reached-top = Początek dokumentu. Wyszukiwanie od końca.
pdfjs-find-reached-bottom = Koniec dokumentu. Wyszukiwanie od początku.
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current }. z { $total } trafienia
        [few] { $current }. z { $total } trafień
       *[many] { $current }. z { $total } trafień
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Więcej niż { $limit } trafienie
        [few] Więcej niż { $limit } trafienia
       *[many] Więcej niż { $limit } trafień
    }
pdfjs-find-not-found = Nie znaleziono tekstu

## Predefined zoom values

pdfjs-page-scale-width = Szerokość strony
pdfjs-page-scale-fit = Dopasowanie strony
pdfjs-page-scale-auto = Skala automatyczna
pdfjs-page-scale-actual = Rozmiar oryginalny
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = { $page }. strona

## Loading indicator messages

pdfjs-loading-error = Podczas wczytywania dokumentu PDF wystąpił błąd.
pdfjs-invalid-file-error = Nieprawidłowy lub uszkodzony plik PDF.
pdfjs-missing-file-error = Brak pliku PDF.
pdfjs-unexpected-response-error = Nieoczekiwana odpowiedź serwera.
pdfjs-rendering-error = Podczas renderowania strony wystąpił błąd.

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date }, { $time }
# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [Przypis: { $type }]

## Password

pdfjs-password-label = Wprowadź hasło, aby otworzyć ten dokument PDF.
pdfjs-password-invalid = Nieprawidłowe hasło. Proszę spróbować ponownie.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Anuluj
pdfjs-web-fonts-disabled = Czcionki sieciowe są wyłączone: nie można użyć osadzonych czcionek PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-free-text-button-label = Tekst
pdfjs-editor-ink-button =
    .title = Rysunek
pdfjs-editor-ink-button-label = Rysunek
pdfjs-editor-stamp-button =
    .title = Dodaj lub edytuj obrazy
pdfjs-editor-stamp-button-label = Dodaj lub edytuj obrazy
pdfjs-editor-highlight-button =
    .title = Wyróżnij
pdfjs-editor-highlight-button-label = Wyróżnij
pdfjs-highlight-floating-button =
    .title = Wyróżnij
pdfjs-highlight-floating-button1 =
    .title = Wyróżnij
    .aria-label = Wyróżnij
pdfjs-highlight-floating-button-label = Wyróżnij

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Usuń rysunek
pdfjs-editor-remove-freetext-button =
    .title = Usuń tekst
pdfjs-editor-remove-stamp-button =
    .title = Usuń obraz
pdfjs-editor-remove-highlight-button =
    .title = Usuń wyróżnienie

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Kolor
pdfjs-editor-free-text-size-input = Rozmiar
pdfjs-editor-ink-color-input = Kolor
pdfjs-editor-ink-thickness-input = Grubość
pdfjs-editor-ink-opacity-input = Nieprzezroczystość
pdfjs-editor-stamp-add-image-button =
    .title = Dodaj obraz
pdfjs-editor-stamp-add-image-button-label = Dodaj obraz
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Grubość
pdfjs-editor-free-highlight-thickness-title =
    .title = Zmień grubość podczas wyróżniania elementów innych niż tekst
pdfjs-free-text =
    .aria-label = Edytor tekstu
pdfjs-free-text-default-content = Zacznij pisać…
pdfjs-ink =
    .aria-label = Edytor rysunku
pdfjs-ink-canvas =
    .aria-label = Obraz utworzony przez użytkownika

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Tekst alternatywny
pdfjs-editor-alt-text-edit-button-label = Edytuj tekst alternatywny
pdfjs-editor-alt-text-dialog-label = Wybierz opcję
pdfjs-editor-alt-text-dialog-description = Tekst alternatywny pomaga, kiedy ktoś nie może zobaczyć obrazu lub gdy się nie wczytuje.
pdfjs-editor-alt-text-add-description-label = Dodaj opis
pdfjs-editor-alt-text-add-description-description = Staraj się napisać 1-2 zdania opisujące temat, miejsce lub działania.
pdfjs-editor-alt-text-mark-decorative-label = Oznacz jako dekoracyjne
pdfjs-editor-alt-text-mark-decorative-description = Używane w przypadku obrazów ozdobnych, takich jak obramowania lub znaki wodne.
pdfjs-editor-alt-text-cancel-button = Anuluj
pdfjs-editor-alt-text-save-button = Zapisz
pdfjs-editor-alt-text-decorative-tooltip = Oznaczone jako dekoracyjne
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Na przykład: „Młody człowiek siada przy stole, aby zjeść posiłek”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Lewy górny róg — zmień rozmiar
pdfjs-editor-resizer-label-top-middle = Górny środkowy — zmień rozmiar
pdfjs-editor-resizer-label-top-right = Prawy górny róg — zmień rozmiar
pdfjs-editor-resizer-label-middle-right = Prawy środkowy — zmień rozmiar
pdfjs-editor-resizer-label-bottom-right = Prawy dolny róg — zmień rozmiar
pdfjs-editor-resizer-label-bottom-middle = Dolny środkowy — zmień rozmiar
pdfjs-editor-resizer-label-bottom-left = Lewy dolny róg — zmień rozmiar
pdfjs-editor-resizer-label-middle-left = Lewy środkowy — zmień rozmiar

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Kolor wyróżnienia
pdfjs-editor-colorpicker-button =
    .title = Zmień kolor
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Wybór kolorów
pdfjs-editor-colorpicker-yellow =
    .title = Żółty
pdfjs-editor-colorpicker-green =
    .title = Zielony
pdfjs-editor-colorpicker-blue =
    .title = Niebieski
pdfjs-editor-colorpicker-pink =
    .title = Różowy
pdfjs-editor-colorpicker-red =
    .title = Czerwony

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Pokaż wszystkie
pdfjs-editor-highlight-show-all-button =
    .title = Pokaż wszystkie
