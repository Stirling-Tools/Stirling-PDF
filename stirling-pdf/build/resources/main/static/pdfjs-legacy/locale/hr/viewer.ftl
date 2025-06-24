# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Prethodna stranica
pdfjs-previous-button-label = Prethodna
pdfjs-next-button =
    .title = Sljedeća stranica
pdfjs-next-button-label = Sljedeća
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Stranica
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = od { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } od { $pagesCount })
pdfjs-zoom-out-button =
    .title = Umanji
pdfjs-zoom-out-button-label = Umanji
pdfjs-zoom-in-button =
    .title = Uvećaj
pdfjs-zoom-in-button-label = Uvećaj
pdfjs-zoom-select =
    .title = Zumiranje
pdfjs-presentation-mode-button =
    .title = Prebaci u prezentacijski način rada
pdfjs-presentation-mode-button-label = Prezentacijski način rada
pdfjs-open-file-button =
    .title = Otvori datoteku
pdfjs-open-file-button-label = Otvori
pdfjs-print-button =
    .title = Ispiši
pdfjs-print-button-label = Ispiši
pdfjs-save-button =
    .title = Spremi
pdfjs-save-button-label = Spremi

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Alati
pdfjs-tools-button-label = Alati
pdfjs-first-page-button =
    .title = Idi na prvu stranicu
pdfjs-first-page-button-label = Idi na prvu stranicu
pdfjs-last-page-button =
    .title = Idi na posljednju stranicu
pdfjs-last-page-button-label = Idi na posljednju stranicu
pdfjs-page-rotate-cw-button =
    .title = Rotiraj u smjeru kazaljke na satu
pdfjs-page-rotate-cw-button-label = Rotiraj u smjeru kazaljke na satu
pdfjs-page-rotate-ccw-button =
    .title = Rotiraj obrnutno od smjera kazaljke na satu
pdfjs-page-rotate-ccw-button-label = Rotiraj obrnutno od smjera kazaljke na satu
pdfjs-cursor-text-select-tool-button =
    .title = Omogući alat za označavanje teksta
pdfjs-cursor-text-select-tool-button-label = Alat za označavanje teksta
pdfjs-cursor-hand-tool-button =
    .title = Omogući ručni alat
pdfjs-cursor-hand-tool-button-label = Ručni alat
pdfjs-scroll-vertical-button =
    .title = Koristi okomito pomicanje
pdfjs-scroll-vertical-button-label = Okomito pomicanje
pdfjs-scroll-horizontal-button =
    .title = Koristi vodoravno pomicanje
pdfjs-scroll-horizontal-button-label = Vodoravno pomicanje
pdfjs-scroll-wrapped-button =
    .title = Koristi kontinuirani raspored stranica
pdfjs-scroll-wrapped-button-label = Kontinuirani raspored stranica
pdfjs-spread-none-button =
    .title = Ne izrađuj duplerice
pdfjs-spread-none-button-label = Pojedinačne stranice
pdfjs-spread-odd-button =
    .title = Izradi duplerice koje počinju s neparnim stranicama
pdfjs-spread-odd-button-label = Neparne duplerice
pdfjs-spread-even-button =
    .title = Izradi duplerice koje počinju s parnim stranicama
pdfjs-spread-even-button-label = Parne duplerice

## Document properties dialog

pdfjs-document-properties-button =
    .title = Svojstva dokumenta …
pdfjs-document-properties-button-label = Svojstva dokumenta …
pdfjs-document-properties-file-name = Naziv datoteke:
pdfjs-document-properties-file-size = Veličina datoteke:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bajtova)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bajtova)
pdfjs-document-properties-title = Naslov:
pdfjs-document-properties-author = Autor:
pdfjs-document-properties-subject = Predmet:
pdfjs-document-properties-keywords = Ključne riječi:
pdfjs-document-properties-creation-date = Datum stvaranja:
pdfjs-document-properties-modification-date = Datum promjene:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Stvaratelj:
pdfjs-document-properties-producer = PDF stvaratelj:
pdfjs-document-properties-version = PDF verzija:
pdfjs-document-properties-page-count = Broj stranica:
pdfjs-document-properties-page-size = Dimenzije stranice:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = uspravno
pdfjs-document-properties-page-size-orientation-landscape = položeno
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
pdfjs-document-properties-linearized = Brzi web pregled:
pdfjs-document-properties-linearized-yes = Da
pdfjs-document-properties-linearized-no = Ne
pdfjs-document-properties-close-button = Zatvori

## Print

pdfjs-print-progress-message = Pripremanje dokumenta za ispis…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Odustani
pdfjs-printing-not-supported = Upozorenje: Ovaj preglednik ne podržava u potpunosti ispisivanje.
pdfjs-printing-not-ready = Upozorenje: PDF nije u potpunosti učitan za ispis.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Prikaži/sakrij bočnu traku
pdfjs-toggle-sidebar-notification-button =
    .title = Prikazivanje i sklanjanje bočne trake (dokument sadrži strukturu/privitke/slojeve)
pdfjs-toggle-sidebar-button-label = Prikaži/sakrij bočnu traku
pdfjs-document-outline-button =
    .title = Prikaži strukturu dokumenta (dvostruki klik za rasklapanje/sklapanje svih stavki)
pdfjs-document-outline-button-label = Struktura dokumenta
pdfjs-attachments-button =
    .title = Prikaži privitke
pdfjs-attachments-button-label = Privitci
pdfjs-layers-button =
    .title = Prikaži slojeve (dvoklik za vraćanje svih slojeva u zadano stanje)
pdfjs-layers-button-label = Slojevi
pdfjs-thumbs-button =
    .title = Prikaži minijature
pdfjs-thumbs-button-label = Minijature
pdfjs-current-outline-item-button =
    .title = Pronađi trenutačni element strukture
pdfjs-current-outline-item-button-label = Trenutačni element strukture
pdfjs-findbar-button =
    .title = Pronađi u dokumentu
pdfjs-findbar-button-label = Pronađi
pdfjs-additional-layers = Dodatni slojevi

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Stranica { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Minijatura stranice { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Pronađi
    .placeholder = Pronađi u dokumentu …
pdfjs-find-previous-button =
    .title = Pronađi prethodno pojavljivanje ovog izraza
pdfjs-find-previous-button-label = Prethodno
pdfjs-find-next-button =
    .title = Pronađi sljedeće pojavljivanje ovog izraza
pdfjs-find-next-button-label = Sljedeće
pdfjs-find-highlight-checkbox = Istankni sve
pdfjs-find-match-case-checkbox-label = Razlikovanje velikih i malih slova
pdfjs-find-entire-word-checkbox-label = Cijele riječi
pdfjs-find-reached-top = Dosegnut početak dokumenta, nastavak s kraja
pdfjs-find-reached-bottom = Dosegnut kraj dokumenta, nastavak s početka
pdfjs-find-not-found = Izraz nije pronađen

## Predefined zoom values

pdfjs-page-scale-width = Prilagodi širini prozora
pdfjs-page-scale-fit = Prilagodi veličini prozora
pdfjs-page-scale-auto = Automatsko zumiranje
pdfjs-page-scale-actual = Stvarna veličina
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale } %

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Stranica { $page }

## Loading indicator messages

pdfjs-loading-error = Došlo je do greške pri učitavanju PDF-a.
pdfjs-invalid-file-error = Neispravna ili oštećena PDF datoteka.
pdfjs-missing-file-error = Nedostaje PDF datoteka.
pdfjs-unexpected-response-error = Neočekivani odgovor poslužitelja.
pdfjs-rendering-error = Došlo je do greške prilikom iscrtavanja stranice.

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
    .alt = [{ $type } Bilješka]

## Password

pdfjs-password-label = Za otvoranje ove PDF datoteku upiši lozinku.
pdfjs-password-invalid = Neispravna lozinka. Pokušaj ponovo.
pdfjs-password-ok-button = U redu
pdfjs-password-cancel-button = Odustani
pdfjs-web-fonts-disabled = Web fontovi su deaktivirani: nije moguće koristiti ugrađene PDF fontove.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-free-text-button-label = Tekst
# Editor Parameters
pdfjs-editor-free-text-color-input = Boja
pdfjs-editor-free-text-size-input = Veličina
pdfjs-editor-ink-color-input = Boja
pdfjs-editor-ink-thickness-input = Debljina
pdfjs-editor-ink-opacity-input = Neprozirnost
pdfjs-free-text =
    .aria-label = Uređivač teksta
pdfjs-free-text-default-content = Počni tipkati …

## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

