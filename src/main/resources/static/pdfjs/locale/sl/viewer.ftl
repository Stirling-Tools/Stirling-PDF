# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Prejšnja stran
pdfjs-previous-button-label = Nazaj
pdfjs-next-button =
    .title = Naslednja stran
pdfjs-next-button-label = Naprej
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Stran
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = od { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } od { $pagesCount })
pdfjs-zoom-out-button =
    .title = Pomanjšaj
pdfjs-zoom-out-button-label = Pomanjšaj
pdfjs-zoom-in-button =
    .title = Povečaj
pdfjs-zoom-in-button-label = Povečaj
pdfjs-zoom-select =
    .title = Povečava
pdfjs-presentation-mode-button =
    .title = Preklopi v način predstavitve
pdfjs-presentation-mode-button-label = Način predstavitve
pdfjs-open-file-button =
    .title = Odpri datoteko
pdfjs-open-file-button-label = Odpri
pdfjs-print-button =
    .title = Natisni
pdfjs-print-button-label = Natisni
pdfjs-save-button =
    .title = Shrani
pdfjs-save-button-label = Shrani
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Prenesi
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Prenesi
pdfjs-bookmark-button =
    .title = Trenutna stran (prikaži URL, ki vodi do trenutne strani)
pdfjs-bookmark-button-label = Na trenutno stran

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Orodja
pdfjs-tools-button-label = Orodja
pdfjs-first-page-button =
    .title = Pojdi na prvo stran
pdfjs-first-page-button-label = Pojdi na prvo stran
pdfjs-last-page-button =
    .title = Pojdi na zadnjo stran
pdfjs-last-page-button-label = Pojdi na zadnjo stran
pdfjs-page-rotate-cw-button =
    .title = Zavrti v smeri urnega kazalca
pdfjs-page-rotate-cw-button-label = Zavrti v smeri urnega kazalca
pdfjs-page-rotate-ccw-button =
    .title = Zavrti v nasprotni smeri urnega kazalca
pdfjs-page-rotate-ccw-button-label = Zavrti v nasprotni smeri urnega kazalca
pdfjs-cursor-text-select-tool-button =
    .title = Omogoči orodje za izbor besedila
pdfjs-cursor-text-select-tool-button-label = Orodje za izbor besedila
pdfjs-cursor-hand-tool-button =
    .title = Omogoči roko
pdfjs-cursor-hand-tool-button-label = Roka
pdfjs-scroll-page-button =
    .title = Uporabi drsenje po strani
pdfjs-scroll-page-button-label = Drsenje po strani
pdfjs-scroll-vertical-button =
    .title = Uporabi navpično drsenje
pdfjs-scroll-vertical-button-label = Navpično drsenje
pdfjs-scroll-horizontal-button =
    .title = Uporabi vodoravno drsenje
pdfjs-scroll-horizontal-button-label = Vodoravno drsenje
pdfjs-scroll-wrapped-button =
    .title = Uporabi ovito drsenje
pdfjs-scroll-wrapped-button-label = Ovito drsenje
pdfjs-spread-none-button =
    .title = Ne združuj razponov strani
pdfjs-spread-none-button-label = Brez razponov
pdfjs-spread-odd-button =
    .title = Združuj razpone strani z začetkom pri lihih straneh
pdfjs-spread-odd-button-label = Lihi razponi
pdfjs-spread-even-button =
    .title = Združuj razpone strani z začetkom pri sodih straneh
pdfjs-spread-even-button-label = Sodi razponi

## Document properties dialog

pdfjs-document-properties-button =
    .title = Lastnosti dokumenta …
pdfjs-document-properties-button-label = Lastnosti dokumenta …
pdfjs-document-properties-file-name = Ime datoteke:
pdfjs-document-properties-file-size = Velikost datoteke:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bajtov)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bajtov)
pdfjs-document-properties-title = Ime:
pdfjs-document-properties-author = Avtor:
pdfjs-document-properties-subject = Tema:
pdfjs-document-properties-keywords = Ključne besede:
pdfjs-document-properties-creation-date = Datum nastanka:
pdfjs-document-properties-modification-date = Datum spremembe:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Ustvaril:
pdfjs-document-properties-producer = Izdelovalec PDF:
pdfjs-document-properties-version = Različica PDF:
pdfjs-document-properties-page-count = Število strani:
pdfjs-document-properties-page-size = Velikost strani:
pdfjs-document-properties-page-size-unit-inches = palcev
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = pokončno
pdfjs-document-properties-page-size-orientation-landscape = ležeče
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Pismo
pdfjs-document-properties-page-size-name-legal = Pravno

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
pdfjs-document-properties-linearized = Hitri spletni ogled:
pdfjs-document-properties-linearized-yes = Da
pdfjs-document-properties-linearized-no = Ne
pdfjs-document-properties-close-button = Zapri

## Print

pdfjs-print-progress-message = Priprava dokumenta na tiskanje …
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress } %
pdfjs-print-progress-close-button = Prekliči
pdfjs-printing-not-supported = Opozorilo: ta brskalnik ne podpira vseh možnosti tiskanja.
pdfjs-printing-not-ready = Opozorilo: PDF ni v celoti naložen za tiskanje.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Preklopi stransko vrstico
pdfjs-toggle-sidebar-notification-button =
    .title = Preklopi stransko vrstico (dokument vsebuje oris/priponke/plasti)
pdfjs-toggle-sidebar-button-label = Preklopi stransko vrstico
pdfjs-document-outline-button =
    .title = Prikaži oris dokumenta (dvokliknite za razširitev/strnitev vseh predmetov)
pdfjs-document-outline-button-label = Oris dokumenta
pdfjs-attachments-button =
    .title = Prikaži priponke
pdfjs-attachments-button-label = Priponke
pdfjs-layers-button =
    .title = Prikaži plasti (dvokliknite za ponastavitev vseh plasti na privzeto stanje)
pdfjs-layers-button-label = Plasti
pdfjs-thumbs-button =
    .title = Prikaži sličice
pdfjs-thumbs-button-label = Sličice
pdfjs-current-outline-item-button =
    .title = Najdi trenutni predmet orisa
pdfjs-current-outline-item-button-label = Trenutni predmet orisa
pdfjs-findbar-button =
    .title = Iskanje po dokumentu
pdfjs-findbar-button-label = Najdi
pdfjs-additional-layers = Dodatne plasti

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Stran { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Sličica strani { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Najdi
    .placeholder = Najdi v dokumentu …
pdfjs-find-previous-button =
    .title = Najdi prejšnjo ponovitev iskanega
pdfjs-find-previous-button-label = Najdi nazaj
pdfjs-find-next-button =
    .title = Najdi naslednjo ponovitev iskanega
pdfjs-find-next-button-label = Najdi naprej
pdfjs-find-highlight-checkbox = Označi vse
pdfjs-find-match-case-checkbox-label = Razlikuj velike/male črke
pdfjs-find-match-diacritics-checkbox-label = Razlikuj diakritične znake
pdfjs-find-entire-word-checkbox-label = Cele besede
pdfjs-find-reached-top = Dosežen začetek dokumenta iz smeri konca
pdfjs-find-reached-bottom = Doseženo konec dokumenta iz smeri začetka
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] Zadetek { $current } od { $total }
        [two] Zadetek { $current } od { $total }
        [few] Zadetek { $current } od { $total }
       *[other] Zadetek { $current } od { $total }
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Več kot { $limit } zadetek
        [two] Več kot { $limit } zadetka
        [few] Več kot { $limit } zadetki
       *[other] Več kot { $limit } zadetkov
    }
pdfjs-find-not-found = Iskanega ni mogoče najti

## Predefined zoom values

pdfjs-page-scale-width = Širina strani
pdfjs-page-scale-fit = Prilagodi stran
pdfjs-page-scale-auto = Samodejno
pdfjs-page-scale-actual = Dejanska velikost
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale } %

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Stran { $page }

## Loading indicator messages

pdfjs-loading-error = Med nalaganjem datoteke PDF je prišlo do napake.
pdfjs-invalid-file-error = Neveljavna ali pokvarjena datoteka PDF.
pdfjs-missing-file-error = Ni datoteke PDF.
pdfjs-unexpected-response-error = Nepričakovan odgovor strežnika.
pdfjs-rendering-error = Med pripravljanjem strani je prišlo do napake!

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
    .alt = [Opomba vrste { $type }]

## Password

pdfjs-password-label = Vnesite geslo za odpiranje te datoteke PDF.
pdfjs-password-invalid = Neveljavno geslo. Poskusite znova.
pdfjs-password-ok-button = V redu
pdfjs-password-cancel-button = Prekliči
pdfjs-web-fonts-disabled = Spletne pisave so onemogočene: vgradnih pisav za PDF ni mogoče uporabiti.

## Editing

pdfjs-editor-free-text-button =
    .title = Besedilo
pdfjs-editor-free-text-button-label = Besedilo
pdfjs-editor-ink-button =
    .title = Riši
pdfjs-editor-ink-button-label = Riši
pdfjs-editor-stamp-button =
    .title = Dodajanje ali urejanje slik
pdfjs-editor-stamp-button-label = Dodajanje ali urejanje slik
pdfjs-editor-highlight-button =
    .title = Označevalnik
pdfjs-editor-highlight-button-label = Označevalnik

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Odstrani risbo
pdfjs-editor-remove-freetext-button =
    .title = Odstrani besedilo
pdfjs-editor-remove-stamp-button =
    .title = Odstrani sliko
pdfjs-editor-remove-highlight-button =
    .title = Odstrani označbo

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Barva
pdfjs-editor-free-text-size-input = Velikost
pdfjs-editor-ink-color-input = Barva
pdfjs-editor-ink-thickness-input = Debelina
pdfjs-editor-ink-opacity-input = Neprosojnost
pdfjs-editor-stamp-add-image-button =
    .title = Dodaj sliko
pdfjs-editor-stamp-add-image-button-label = Dodaj sliko
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Debelina
pdfjs-editor-free-highlight-thickness-title =
    .title = Spremeni debelino pri označevanju nebesedilnih elementov
pdfjs-free-text =
    .aria-label = Urejevalnik besedila
pdfjs-free-text-default-content = Začnite tipkati …
pdfjs-ink =
    .aria-label = Urejevalnik risanja
pdfjs-ink-canvas =
    .aria-label = Uporabnikova slika

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Nadomestno besedilo
pdfjs-editor-alt-text-edit-button-label = Uredi nadomestno besedilo
pdfjs-editor-alt-text-dialog-label = Izberite možnost
pdfjs-editor-alt-text-dialog-description = Nadomestno besedilo se prikaže tistim, ki ne vidijo slike, ali če se ta ne naloži.
pdfjs-editor-alt-text-add-description-label = Dodaj opis
pdfjs-editor-alt-text-add-description-description = Poskušajte v enem ali dveh stavkih opisati motiv, okolje ali dejanja.
pdfjs-editor-alt-text-mark-decorative-label = Označi kot okrasno
pdfjs-editor-alt-text-mark-decorative-description = Uporablja se za slike, ki služijo samo okrasu, na primer obrobe ali vodne žige.
pdfjs-editor-alt-text-cancel-button = Prekliči
pdfjs-editor-alt-text-save-button = Shrani
pdfjs-editor-alt-text-decorative-tooltip = Označeno kot okrasno
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Na primer: "Mladenič sedi za mizo pri jedi"

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Zgornji levi kot – spremeni velikost
pdfjs-editor-resizer-label-top-middle = Zgoraj na sredini – spremeni velikost
pdfjs-editor-resizer-label-top-right = Zgornji desni kot – spremeni velikost
pdfjs-editor-resizer-label-middle-right = Desno na sredini – spremeni velikost
pdfjs-editor-resizer-label-bottom-right = Spodnji desni kot – spremeni velikost
pdfjs-editor-resizer-label-bottom-middle = Spodaj na sredini – spremeni velikost
pdfjs-editor-resizer-label-bottom-left = Spodnji levi kot – spremeni velikost
pdfjs-editor-resizer-label-middle-left = Levo na sredini – spremeni velikost

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Barva označbe
pdfjs-editor-colorpicker-button =
    .title = Spremeni barvo
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Izbira barve
pdfjs-editor-colorpicker-yellow =
    .title = Rumena
pdfjs-editor-colorpicker-green =
    .title = Zelena
pdfjs-editor-colorpicker-blue =
    .title = Modra
pdfjs-editor-colorpicker-pink =
    .title = Roza
pdfjs-editor-colorpicker-red =
    .title = Rdeča

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Prikaži vse
pdfjs-editor-highlight-show-all-button =
    .title = Prikaži vse
