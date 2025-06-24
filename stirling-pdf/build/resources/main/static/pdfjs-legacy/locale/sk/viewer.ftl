# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Predchádzajúca strana
pdfjs-previous-button-label = Predchádzajúca
pdfjs-next-button =
    .title = Nasledujúca strana
pdfjs-next-button-label = Nasledujúca
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Strana
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = z { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } z { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zmenšiť veľkosť
pdfjs-zoom-out-button-label = Zmenšiť veľkosť
pdfjs-zoom-in-button =
    .title = Zväčšiť veľkosť
pdfjs-zoom-in-button-label = Zväčšiť veľkosť
pdfjs-zoom-select =
    .title = Nastavenie veľkosti
pdfjs-presentation-mode-button =
    .title = Prepnúť na režim prezentácie
pdfjs-presentation-mode-button-label = Režim prezentácie
pdfjs-open-file-button =
    .title = Otvoriť súbor
pdfjs-open-file-button-label = Otvoriť
pdfjs-print-button =
    .title = Tlačiť
pdfjs-print-button-label = Tlačiť
pdfjs-save-button =
    .title = Uložiť
pdfjs-save-button-label = Uložiť
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Stiahnuť
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Stiahnuť
pdfjs-bookmark-button =
    .title = Aktuálna stránka (zobraziť adresu URL z aktuálnej stránky)
pdfjs-bookmark-button-label = Aktuálna stránka
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Otvoriť v aplikácii
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Otvoriť v aplikácii

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Nástroje
pdfjs-tools-button-label = Nástroje
pdfjs-first-page-button =
    .title = Prejsť na prvú stranu
pdfjs-first-page-button-label = Prejsť na prvú stranu
pdfjs-last-page-button =
    .title = Prejsť na poslednú stranu
pdfjs-last-page-button-label = Prejsť na poslednú stranu
pdfjs-page-rotate-cw-button =
    .title = Otočiť v smere hodinových ručičiek
pdfjs-page-rotate-cw-button-label = Otočiť v smere hodinových ručičiek
pdfjs-page-rotate-ccw-button =
    .title = Otočiť proti smeru hodinových ručičiek
pdfjs-page-rotate-ccw-button-label = Otočiť proti smeru hodinových ručičiek
pdfjs-cursor-text-select-tool-button =
    .title = Povoliť výber textu
pdfjs-cursor-text-select-tool-button-label = Výber textu
pdfjs-cursor-hand-tool-button =
    .title = Povoliť nástroj ruka
pdfjs-cursor-hand-tool-button-label = Nástroj ruka
pdfjs-scroll-page-button =
    .title = Použiť rolovanie po stránkach
pdfjs-scroll-page-button-label = Rolovanie po stránkach
pdfjs-scroll-vertical-button =
    .title = Používať zvislé posúvanie
pdfjs-scroll-vertical-button-label = Zvislé posúvanie
pdfjs-scroll-horizontal-button =
    .title = Používať vodorovné posúvanie
pdfjs-scroll-horizontal-button-label = Vodorovné posúvanie
pdfjs-scroll-wrapped-button =
    .title = Použiť postupné posúvanie
pdfjs-scroll-wrapped-button-label = Postupné posúvanie
pdfjs-spread-none-button =
    .title = Nezdružovať stránky
pdfjs-spread-none-button-label = Žiadne združovanie
pdfjs-spread-odd-button =
    .title = Združí stránky a umiestni nepárne stránky vľavo
pdfjs-spread-odd-button-label = Združiť stránky (nepárne vľavo)
pdfjs-spread-even-button =
    .title = Združí stránky a umiestni párne stránky vľavo
pdfjs-spread-even-button-label = Združiť stránky (párne vľavo)

## Document properties dialog

pdfjs-document-properties-button =
    .title = Vlastnosti dokumentu…
pdfjs-document-properties-button-label = Vlastnosti dokumentu…
pdfjs-document-properties-file-name = Názov súboru:
pdfjs-document-properties-file-size = Veľkosť súboru:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } kB ({ $size_b } bajtov)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bajtov)
pdfjs-document-properties-title = Názov:
pdfjs-document-properties-author = Autor:
pdfjs-document-properties-subject = Predmet:
pdfjs-document-properties-keywords = Kľúčové slová:
pdfjs-document-properties-creation-date = Dátum vytvorenia:
pdfjs-document-properties-modification-date = Dátum úpravy:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Aplikácia:
pdfjs-document-properties-producer = Tvorca PDF:
pdfjs-document-properties-version = Verzia PDF:
pdfjs-document-properties-page-count = Počet strán:
pdfjs-document-properties-page-size = Veľkosť stránky:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = na výšku
pdfjs-document-properties-page-size-orientation-landscape = na šírku
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = List
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
pdfjs-document-properties-linearized = Rýchle zobrazovanie z webu:
pdfjs-document-properties-linearized-yes = Áno
pdfjs-document-properties-linearized-no = Nie
pdfjs-document-properties-close-button = Zavrieť

## Print

pdfjs-print-progress-message = Príprava dokumentu na tlač…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress } %
pdfjs-print-progress-close-button = Zrušiť
pdfjs-printing-not-supported = Upozornenie: tlač nie je v tomto prehliadači plne podporovaná.
pdfjs-printing-not-ready = Upozornenie: súbor PDF nie je plne načítaný pre tlač.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Prepnúť bočný panel
pdfjs-toggle-sidebar-notification-button =
    .title = Prepnúť bočný panel (dokument obsahuje osnovu/prílohy/vrstvy)
pdfjs-toggle-sidebar-button-label = Prepnúť bočný panel
pdfjs-document-outline-button =
    .title = Zobraziť osnovu dokumentu (dvojitým kliknutím rozbalíte/zbalíte všetky položky)
pdfjs-document-outline-button-label = Osnova dokumentu
pdfjs-attachments-button =
    .title = Zobraziť prílohy
pdfjs-attachments-button-label = Prílohy
pdfjs-layers-button =
    .title = Zobraziť vrstvy (dvojitým kliknutím uvediete všetky vrstvy do pôvodného stavu)
pdfjs-layers-button-label = Vrstvy
pdfjs-thumbs-button =
    .title = Zobraziť miniatúry
pdfjs-thumbs-button-label = Miniatúry
pdfjs-current-outline-item-button =
    .title = Nájsť aktuálnu položku v osnove
pdfjs-current-outline-item-button-label = Aktuálna položka v osnove
pdfjs-findbar-button =
    .title = Hľadať v dokumente
pdfjs-findbar-button-label = Hľadať
pdfjs-additional-layers = Ďalšie vrstvy

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Strana { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatúra strany { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Hľadať
    .placeholder = Hľadať v dokumente…
pdfjs-find-previous-button =
    .title = Vyhľadať predchádzajúci výskyt reťazca
pdfjs-find-previous-button-label = Predchádzajúce
pdfjs-find-next-button =
    .title = Vyhľadať ďalší výskyt reťazca
pdfjs-find-next-button-label = Ďalšie
pdfjs-find-highlight-checkbox = Zvýrazniť všetky
pdfjs-find-match-case-checkbox-label = Rozlišovať veľkosť písmen
pdfjs-find-match-diacritics-checkbox-label = Rozlišovať diakritiku
pdfjs-find-entire-word-checkbox-label = Celé slová
pdfjs-find-reached-top = Bol dosiahnutý začiatok stránky, pokračuje sa od konca
pdfjs-find-reached-bottom = Bol dosiahnutý koniec stránky, pokračuje sa od začiatku
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] Výskyt { $current } z { $total }
        [few] Výskyt { $current } z { $total }
        [many] Výskyt { $current } z { $total }
       *[other] Výskyt { $current } z { $total }
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Viac ako { $limit } výskyt
        [few] Viac ako { $limit } výskyty
        [many] Viac ako { $limit } výskytov
       *[other] Viac ako { $limit } výskytov
    }
pdfjs-find-not-found = Výraz nebol nájdený

## Predefined zoom values

pdfjs-page-scale-width = Na šírku strany
pdfjs-page-scale-fit = Na veľkosť strany
pdfjs-page-scale-auto = Automatická veľkosť
pdfjs-page-scale-actual = Skutočná veľkosť
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale } %

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Strana { $page }

## Loading indicator messages

pdfjs-loading-error = Počas načítavania dokumentu PDF sa vyskytla chyba.
pdfjs-invalid-file-error = Neplatný alebo poškodený súbor PDF.
pdfjs-missing-file-error = Chýbajúci súbor PDF.
pdfjs-unexpected-response-error = Neočakávaná odpoveď zo servera.
pdfjs-rendering-error = Pri vykresľovaní stránky sa vyskytla chyba.

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
    .alt = [Anotácia typu { $type }]

## Password

pdfjs-password-label = Ak chcete otvoriť tento súbor PDF, zadajte jeho heslo.
pdfjs-password-invalid = Heslo nie je platné. Skúste to znova.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Zrušiť
pdfjs-web-fonts-disabled = Webové písma sú vypnuté: nie je možné použiť písma vložené do súboru PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Text
pdfjs-editor-free-text-button-label = Text
pdfjs-editor-ink-button =
    .title = Kresliť
pdfjs-editor-ink-button-label = Kresliť
pdfjs-editor-stamp-button =
    .title = Pridať alebo upraviť obrázky
pdfjs-editor-stamp-button-label = Pridať alebo upraviť obrázky
pdfjs-editor-highlight-button =
    .title = Zvýrazniť
pdfjs-editor-highlight-button-label = Zvýrazniť
pdfjs-highlight-floating-button =
    .title = Zvýrazniť
pdfjs-highlight-floating-button1 =
    .title = Zvýrazniť
    .aria-label = Zvýrazniť
pdfjs-highlight-floating-button-label = Zvýrazniť

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Odstrániť kresbu
pdfjs-editor-remove-freetext-button =
    .title = Odstrániť text
pdfjs-editor-remove-stamp-button =
    .title = Odstrániť obrázok
pdfjs-editor-remove-highlight-button =
    .title = Odstrániť zvýraznenie

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Farba
pdfjs-editor-free-text-size-input = Veľkosť
pdfjs-editor-ink-color-input = Farba
pdfjs-editor-ink-thickness-input = Hrúbka
pdfjs-editor-ink-opacity-input = Priehľadnosť
pdfjs-editor-stamp-add-image-button =
    .title = Pridať obrázok
pdfjs-editor-stamp-add-image-button-label = Pridať obrázok
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Hrúbka
pdfjs-editor-free-highlight-thickness-title =
    .title = Zmeňte hrúbku pre zvýrazňovanie iných položiek ako textu
pdfjs-free-text =
    .aria-label = Textový editor
pdfjs-free-text-default-content = Začnite písať…
pdfjs-ink =
    .aria-label = Editor kreslenia
pdfjs-ink-canvas =
    .aria-label = Obrázok vytvorený používateľom

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternatívny text
pdfjs-editor-alt-text-edit-button-label = Upraviť alternatívny text
pdfjs-editor-alt-text-dialog-label = Vyberte možnosť
pdfjs-editor-alt-text-dialog-description = Alternatívny text (alt text) pomáha, keď ľudia obrázok nevidia alebo sa nenačítava.
pdfjs-editor-alt-text-add-description-label = Pridať popis
pdfjs-editor-alt-text-add-description-description = Zamerajte sa na 1-2 vety, ktoré popisujú predmet, prostredie alebo akcie.
pdfjs-editor-alt-text-mark-decorative-label = Označiť ako dekoratívny
pdfjs-editor-alt-text-mark-decorative-description = Používa sa na ozdobné obrázky, ako sú okraje alebo vodoznaky.
pdfjs-editor-alt-text-cancel-button = Zrušiť
pdfjs-editor-alt-text-save-button = Uložiť
pdfjs-editor-alt-text-decorative-tooltip = Označený ako dekoratívny
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Napríklad: „Mladý muž si sadá za stôl, aby sa najedol“

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Ľavý horný roh – zmena veľkosti
pdfjs-editor-resizer-label-top-middle = Horný stred – zmena veľkosti
pdfjs-editor-resizer-label-top-right = Pravý horný roh – zmena veľkosti
pdfjs-editor-resizer-label-middle-right = Vpravo uprostred – zmena veľkosti
pdfjs-editor-resizer-label-bottom-right = Pravý dolný roh – zmena veľkosti
pdfjs-editor-resizer-label-bottom-middle = Stred dole – zmena veľkosti
pdfjs-editor-resizer-label-bottom-left = Ľavý dolný roh – zmena veľkosti
pdfjs-editor-resizer-label-middle-left = Vľavo uprostred – zmena veľkosti

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Farba zvýraznenia
pdfjs-editor-colorpicker-button =
    .title = Zmeniť farbu
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Výber farieb
pdfjs-editor-colorpicker-yellow =
    .title = Žltá
pdfjs-editor-colorpicker-green =
    .title = Zelená
pdfjs-editor-colorpicker-blue =
    .title = Modrá
pdfjs-editor-colorpicker-pink =
    .title = Ružová
pdfjs-editor-colorpicker-red =
    .title = Červená

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Zobraziť všetko
pdfjs-editor-highlight-show-all-button =
    .title = Zobraziť všetko
