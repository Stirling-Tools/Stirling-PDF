# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Piyrwyjszo strōna
pdfjs-previous-button-label = Piyrwyjszo
pdfjs-next-button =
    .title = Nastympno strōna
pdfjs-next-button-label = Dalij
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Strōna
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = ze { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } ze { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zmyńsz
pdfjs-zoom-out-button-label = Zmyńsz
pdfjs-zoom-in-button =
    .title = Zwiynksz
pdfjs-zoom-in-button-label = Zwiynksz
pdfjs-zoom-select =
    .title = Srogość
pdfjs-presentation-mode-button =
    .title = Przełōncz na tryb prezyntacyje
pdfjs-presentation-mode-button-label = Tryb prezyntacyje
pdfjs-open-file-button =
    .title = Ôdewrzij zbiōr
pdfjs-open-file-button-label = Ôdewrzij
pdfjs-print-button =
    .title = Durkuj
pdfjs-print-button-label = Durkuj

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Noczynia
pdfjs-tools-button-label = Noczynia
pdfjs-first-page-button =
    .title = Idź ku piyrszyj strōnie
pdfjs-first-page-button-label = Idź ku piyrszyj strōnie
pdfjs-last-page-button =
    .title = Idź ku ôstatnij strōnie
pdfjs-last-page-button-label = Idź ku ôstatnij strōnie
pdfjs-page-rotate-cw-button =
    .title = Zwyrtnij w prawo
pdfjs-page-rotate-cw-button-label = Zwyrtnij w prawo
pdfjs-page-rotate-ccw-button =
    .title = Zwyrtnij w lewo
pdfjs-page-rotate-ccw-button-label = Zwyrtnij w lewo
pdfjs-cursor-text-select-tool-button =
    .title = Załōncz noczynie ôbiyranio tekstu
pdfjs-cursor-text-select-tool-button-label = Noczynie ôbiyranio tekstu
pdfjs-cursor-hand-tool-button =
    .title = Załōncz noczynie rōnczka
pdfjs-cursor-hand-tool-button-label = Noczynie rōnczka
pdfjs-scroll-vertical-button =
    .title = Używej piōnowego przewijanio
pdfjs-scroll-vertical-button-label = Piōnowe przewijanie
pdfjs-scroll-horizontal-button =
    .title = Używej poziōmego przewijanio
pdfjs-scroll-horizontal-button-label = Poziōme przewijanie
pdfjs-scroll-wrapped-button =
    .title = Używej szichtowego przewijanio
pdfjs-scroll-wrapped-button-label = Szichtowe przewijanie
pdfjs-spread-none-button =
    .title = Niy dowej strōn w widoku po dwie
pdfjs-spread-none-button-label = Po jednyj strōnie
pdfjs-spread-odd-button =
    .title = Pokoż strōny po dwie; niyporziste po lewyj
pdfjs-spread-odd-button-label = Niyporziste po lewyj
pdfjs-spread-even-button =
    .title = Pokoż strōny po dwie; porziste po lewyj
pdfjs-spread-even-button-label = Porziste po lewyj

## Document properties dialog

pdfjs-document-properties-button =
    .title = Włosności dokumyntu…
pdfjs-document-properties-button-label = Włosności dokumyntu…
pdfjs-document-properties-file-name = Miano zbioru:
pdfjs-document-properties-file-size = Srogość zbioru:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } B)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } B)
pdfjs-document-properties-title = Tytuł:
pdfjs-document-properties-author = Autōr:
pdfjs-document-properties-subject = Tymat:
pdfjs-document-properties-keywords = Kluczowe słowa:
pdfjs-document-properties-creation-date = Data zrychtowanio:
pdfjs-document-properties-modification-date = Data zmiany:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Zrychtowane ôd:
pdfjs-document-properties-producer = PDF ôd:
pdfjs-document-properties-version = Wersyjo PDF:
pdfjs-document-properties-page-count = Wielość strōn:
pdfjs-document-properties-page-size = Srogość strōny:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = piōnowo
pdfjs-document-properties-page-size-orientation-landscape = poziōmo
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Letter
pdfjs-document-properties-page-size-name-legal = Legal

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = Gibki necowy podglōnd:
pdfjs-document-properties-linearized-yes = Ja
pdfjs-document-properties-linearized-no = Niy
pdfjs-document-properties-close-button = Zawrzij

## Print

pdfjs-print-progress-message = Rychtowanie dokumyntu do durku…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Pociep
pdfjs-printing-not-supported = Pozōr: Ta przeglōndarka niy cołkiym ôbsuguje durk.
pdfjs-printing-not-ready = Pozōr: Tyn PDF niy ma za tela zaladowany do durku.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Przełōncz posek na rancie
pdfjs-toggle-sidebar-notification-button =
    .title = Przełōncz posek na rancie (dokumynt mo struktura/przidowki/warstwy)
pdfjs-toggle-sidebar-button-label = Przełōncz posek na rancie
pdfjs-document-outline-button =
    .title = Pokoż struktura dokumyntu (tuplowane klikniyncie rozszyrzo/swijo wszyskie elymynta)
pdfjs-document-outline-button-label = Struktura dokumyntu
pdfjs-attachments-button =
    .title = Pokoż przidowki
pdfjs-attachments-button-label = Przidowki
pdfjs-layers-button =
    .title = Pokoż warstwy (tuplowane klikniyncie resetuje wszyskie warstwy do bazowego stanu)
pdfjs-layers-button-label = Warstwy
pdfjs-thumbs-button =
    .title = Pokoż miniatury
pdfjs-thumbs-button-label = Miniatury
pdfjs-findbar-button =
    .title = Znojdź w dokumyncie
pdfjs-findbar-button-label = Znojdź
pdfjs-additional-layers = Nadbytnie warstwy

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Strōna { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura strōny { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Znojdź
    .placeholder = Znojdź w dokumyncie…
pdfjs-find-previous-button =
    .title = Znojdź piyrwyjsze pokozanie sie tyj frazy
pdfjs-find-previous-button-label = Piyrwyjszo
pdfjs-find-next-button =
    .title = Znojdź nastympne pokozanie sie tyj frazy
pdfjs-find-next-button-label = Dalij
pdfjs-find-highlight-checkbox = Zaznacz wszysko
pdfjs-find-match-case-checkbox-label = Poznowej srogość liter
pdfjs-find-entire-word-checkbox-label = Cołke słowa
pdfjs-find-reached-top = Doszło do samego wiyrchu strōny, dalij ôd spodku
pdfjs-find-reached-bottom = Doszło do samego spodku strōny, dalij ôd wiyrchu
pdfjs-find-not-found = Fraza niy znaleziōno

## Predefined zoom values

pdfjs-page-scale-width = Szyrzka strōny
pdfjs-page-scale-fit = Napasowanie strōny
pdfjs-page-scale-auto = Autōmatyczno srogość
pdfjs-page-scale-actual = Aktualno srogość
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = Przi ladowaniu PDFa pokozoł sie feler.
pdfjs-invalid-file-error = Zły abo felerny zbiōr PDF.
pdfjs-missing-file-error = Chybio zbioru PDF.
pdfjs-unexpected-response-error = Niyôczekowano ôdpowiydź serwera.
pdfjs-rendering-error = Przi renderowaniu strōny pokozoł sie feler.

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
    .alt = [Anotacyjo typu { $type }]

## Password

pdfjs-password-label = Wkludź hasło, coby ôdewrzić tyn zbiōr PDF.
pdfjs-password-invalid = Hasło je złe. Sprōbuj jeszcze roz.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Pociep
pdfjs-web-fonts-disabled = Necowe fōnty sōm zastawiōne: niy idzie użyć wkludzōnych fōntōw PDF.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

