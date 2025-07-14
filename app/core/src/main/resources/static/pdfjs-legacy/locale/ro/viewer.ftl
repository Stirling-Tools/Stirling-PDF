# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pagina precedentă
pdfjs-previous-button-label = Înapoi
pdfjs-next-button =
    .title = Pagina următoare
pdfjs-next-button-label = Înainte
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pagina
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = din { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } din { $pagesCount })
pdfjs-zoom-out-button =
    .title = Micșorează
pdfjs-zoom-out-button-label = Micșorează
pdfjs-zoom-in-button =
    .title = Mărește
pdfjs-zoom-in-button-label = Mărește
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Comută la modul de prezentare
pdfjs-presentation-mode-button-label = Mod de prezentare
pdfjs-open-file-button =
    .title = Deschide un fișier
pdfjs-open-file-button-label = Deschide
pdfjs-print-button =
    .title = Tipărește
pdfjs-print-button-label = Tipărește

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Instrumente
pdfjs-tools-button-label = Instrumente
pdfjs-first-page-button =
    .title = Mergi la prima pagină
pdfjs-first-page-button-label = Mergi la prima pagină
pdfjs-last-page-button =
    .title = Mergi la ultima pagină
pdfjs-last-page-button-label = Mergi la ultima pagină
pdfjs-page-rotate-cw-button =
    .title = Rotește în sensul acelor de ceas
pdfjs-page-rotate-cw-button-label = Rotește în sensul acelor de ceas
pdfjs-page-rotate-ccw-button =
    .title = Rotește în sens invers al acelor de ceas
pdfjs-page-rotate-ccw-button-label = Rotește în sens invers al acelor de ceas
pdfjs-cursor-text-select-tool-button =
    .title = Activează instrumentul de selecție a textului
pdfjs-cursor-text-select-tool-button-label = Instrumentul de selecție a textului
pdfjs-cursor-hand-tool-button =
    .title = Activează instrumentul mână
pdfjs-cursor-hand-tool-button-label = Unealta mână
pdfjs-scroll-vertical-button =
    .title = Folosește derularea verticală
pdfjs-scroll-vertical-button-label = Derulare verticală
pdfjs-scroll-horizontal-button =
    .title = Folosește derularea orizontală
pdfjs-scroll-horizontal-button-label = Derulare orizontală
pdfjs-scroll-wrapped-button =
    .title = Folosește derularea încadrată
pdfjs-scroll-wrapped-button-label = Derulare încadrată
pdfjs-spread-none-button =
    .title = Nu uni paginile broșate
pdfjs-spread-none-button-label = Fără pagini broșate
pdfjs-spread-odd-button =
    .title = Unește paginile broșate începând cu cele impare
pdfjs-spread-odd-button-label = Broșare pagini impare
pdfjs-spread-even-button =
    .title = Unește paginile broșate începând cu cele pare
pdfjs-spread-even-button-label = Broșare pagini pare

## Document properties dialog

pdfjs-document-properties-button =
    .title = Proprietățile documentului…
pdfjs-document-properties-button-label = Proprietățile documentului…
pdfjs-document-properties-file-name = Numele fișierului:
pdfjs-document-properties-file-size = Mărimea fișierului:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } byți)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } byți)
pdfjs-document-properties-title = Titlu:
pdfjs-document-properties-author = Autor:
pdfjs-document-properties-subject = Subiect:
pdfjs-document-properties-keywords = Cuvinte cheie:
pdfjs-document-properties-creation-date = Data creării:
pdfjs-document-properties-modification-date = Data modificării:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Autor:
pdfjs-document-properties-producer = Producător PDF:
pdfjs-document-properties-version = Versiune PDF:
pdfjs-document-properties-page-count = Număr de pagini:
pdfjs-document-properties-page-size = Mărimea paginii:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = verticală
pdfjs-document-properties-page-size-orientation-landscape = orizontală
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Literă
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
pdfjs-document-properties-linearized = Vizualizare web rapidă:
pdfjs-document-properties-linearized-yes = Da
pdfjs-document-properties-linearized-no = Nu
pdfjs-document-properties-close-button = Închide

## Print

pdfjs-print-progress-message = Se pregătește documentul pentru tipărire…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Renunță
pdfjs-printing-not-supported = Avertisment: Tipărirea nu este suportată în totalitate de acest browser.
pdfjs-printing-not-ready = Avertisment: PDF-ul nu este încărcat complet pentru tipărire.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Comută bara laterală
pdfjs-toggle-sidebar-button-label = Comută bara laterală
pdfjs-document-outline-button =
    .title = Afișează schița documentului (dublu-clic pentru a extinde/restrânge toate elementele)
pdfjs-document-outline-button-label = Schița documentului
pdfjs-attachments-button =
    .title = Afișează atașamentele
pdfjs-attachments-button-label = Atașamente
pdfjs-thumbs-button =
    .title = Afișează miniaturi
pdfjs-thumbs-button-label = Miniaturi
pdfjs-findbar-button =
    .title = Caută în document
pdfjs-findbar-button-label = Caută

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pagina { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura paginii { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Caută
    .placeholder = Caută în document…
pdfjs-find-previous-button =
    .title = Mergi la apariția anterioară a textului
pdfjs-find-previous-button-label = Înapoi
pdfjs-find-next-button =
    .title = Mergi la apariția următoare a textului
pdfjs-find-next-button-label = Înainte
pdfjs-find-highlight-checkbox = Evidențiază toate aparițiile
pdfjs-find-match-case-checkbox-label = Ține cont de majuscule și minuscule
pdfjs-find-entire-word-checkbox-label = Cuvinte întregi
pdfjs-find-reached-top = Am ajuns la începutul documentului, continuă de la sfârșit
pdfjs-find-reached-bottom = Am ajuns la sfârșitul documentului, continuă de la început
pdfjs-find-not-found = Nu s-a găsit textul

## Predefined zoom values

pdfjs-page-scale-width = Lățime pagină
pdfjs-page-scale-fit = Potrivire la pagină
pdfjs-page-scale-auto = Zoom automat
pdfjs-page-scale-actual = Mărime reală
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = A intervenit o eroare la încărcarea PDF-ului.
pdfjs-invalid-file-error = Fișier PDF nevalid sau corupt.
pdfjs-missing-file-error = Fișier PDF lipsă.
pdfjs-unexpected-response-error = Răspuns neașteptat de la server.
pdfjs-rendering-error = A intervenit o eroare la randarea paginii.

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
    .alt = [Adnotare { $type }]

## Password

pdfjs-password-label = Introdu parola pentru a deschide acest fișier PDF.
pdfjs-password-invalid = Parolă nevalidă. Te rugăm să încerci din nou.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Renunță
pdfjs-web-fonts-disabled = Fonturile web sunt dezactivate: nu se pot folosi fonturile PDF încorporate.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

