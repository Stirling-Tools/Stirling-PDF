# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Předchadna strona
pdfjs-previous-button-label = Wróćo
pdfjs-next-button =
    .title = Přichodna strona
pdfjs-next-button-label = Dale
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Strona
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = z { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } z { $pagesCount })
pdfjs-zoom-out-button =
    .title = Pomjeńšić
pdfjs-zoom-out-button-label = Pomjeńšić
pdfjs-zoom-in-button =
    .title = Powjetšić
pdfjs-zoom-in-button-label = Powjetšić
pdfjs-zoom-select =
    .title = Skalowanje
pdfjs-presentation-mode-button =
    .title = Do prezentaciskeho modusa přeńć
pdfjs-presentation-mode-button-label = Prezentaciski modus
pdfjs-open-file-button =
    .title = Dataju wočinić
pdfjs-open-file-button-label = Wočinić
pdfjs-print-button =
    .title = Ćišćeć
pdfjs-print-button-label = Ćišćeć
pdfjs-save-button =
    .title = Składować
pdfjs-save-button-label = Składować
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Sćahnyć
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Sćahnyć
pdfjs-bookmark-button =
    .title = Aktualna strona (URL z aktualneje strony pokazać)
pdfjs-bookmark-button-label = Aktualna strona
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = W nałoženju wočinić
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = W nałoženju wočinić

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Nastroje
pdfjs-tools-button-label = Nastroje
pdfjs-first-page-button =
    .title = K prěnjej stronje
pdfjs-first-page-button-label = K prěnjej stronje
pdfjs-last-page-button =
    .title = K poslednjej stronje
pdfjs-last-page-button-label = K poslednjej stronje
pdfjs-page-rotate-cw-button =
    .title = K směrej časnika wjerćeć
pdfjs-page-rotate-cw-button-label = K směrej časnika wjerćeć
pdfjs-page-rotate-ccw-button =
    .title = Přećiwo směrej časnika wjerćeć
pdfjs-page-rotate-ccw-button-label = Přećiwo směrej časnika wjerćeć
pdfjs-cursor-text-select-tool-button =
    .title = Nastroj za wuběranje teksta zmóžnić
pdfjs-cursor-text-select-tool-button-label = Nastroj za wuběranje teksta
pdfjs-cursor-hand-tool-button =
    .title = Ručny nastroj zmóžnić
pdfjs-cursor-hand-tool-button-label = Ručny nastroj
pdfjs-scroll-page-button =
    .title = Kulenje strony wužiwać
pdfjs-scroll-page-button-label = Kulenje strony
pdfjs-scroll-vertical-button =
    .title = Wertikalne suwanje wužiwać
pdfjs-scroll-vertical-button-label = Wertikalne suwanje
pdfjs-scroll-horizontal-button =
    .title = Horicontalne suwanje wužiwać
pdfjs-scroll-horizontal-button-label = Horicontalne suwanje
pdfjs-scroll-wrapped-button =
    .title = Postupne suwanje wužiwać
pdfjs-scroll-wrapped-button-label = Postupne suwanje
pdfjs-spread-none-button =
    .title = Strony njezwjazać
pdfjs-spread-none-button-label = Žana dwójna strona
pdfjs-spread-odd-button =
    .title = Strony započinajo z njerunymi stronami zwjazać
pdfjs-spread-odd-button-label = Njerune strony
pdfjs-spread-even-button =
    .title = Strony započinajo z runymi stronami zwjazać
pdfjs-spread-even-button-label = Rune strony

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumentowe kajkosće…
pdfjs-document-properties-button-label = Dokumentowe kajkosće…
pdfjs-document-properties-file-name = Mjeno dataje:
pdfjs-document-properties-file-size = Wulkosć dataje:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bajtow)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bajtow)
pdfjs-document-properties-title = Titul:
pdfjs-document-properties-author = Awtor:
pdfjs-document-properties-subject = Předmjet:
pdfjs-document-properties-keywords = Klučowe słowa:
pdfjs-document-properties-creation-date = Datum wutworjenja:
pdfjs-document-properties-modification-date = Datum změny:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Awtor:
pdfjs-document-properties-producer = PDF-zhotowjer:
pdfjs-document-properties-version = PDF-wersija:
pdfjs-document-properties-page-count = Ličba stronow:
pdfjs-document-properties-page-size = Wulkosć strony:
pdfjs-document-properties-page-size-unit-inches = cól
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = wysoki format
pdfjs-document-properties-page-size-orientation-landscape = prěčny format
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
pdfjs-document-properties-linearized = Fast Web View:
pdfjs-document-properties-linearized-yes = Haj
pdfjs-document-properties-linearized-no = Ně
pdfjs-document-properties-close-button = Začinić

## Print

pdfjs-print-progress-message = Dokument so za ćišćenje přihotuje…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Přetorhnyć
pdfjs-printing-not-supported = Warnowanje: Ćišćenje so přez tutón wobhladowak połnje njepodpěruje.
pdfjs-printing-not-ready = Warnowanje: PDF njeje so za ćišćenje dospołnje začitał.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Bóčnicu pokazać/schować
pdfjs-toggle-sidebar-notification-button =
    .title = Bóčnicu přepinać (dokument rozrjad/přiwěški/woršty wobsahuje)
pdfjs-toggle-sidebar-button-label = Bóčnicu pokazać/schować
pdfjs-document-outline-button =
    .title = Dokumentowy naćisk pokazać (dwójne kliknjenje, zo bychu so wšě zapiski pokazali/schowali)
pdfjs-document-outline-button-label = Dokumentowa struktura
pdfjs-attachments-button =
    .title = Přiwěški pokazać
pdfjs-attachments-button-label = Přiwěški
pdfjs-layers-button =
    .title = Woršty pokazać (klikńće dwójce, zo byšće wšě woršty na standardny staw wróćo stajił)
pdfjs-layers-button-label = Woršty
pdfjs-thumbs-button =
    .title = Miniatury pokazać
pdfjs-thumbs-button-label = Miniatury
pdfjs-current-outline-item-button =
    .title = Aktualny rozrjadowy zapisk pytać
pdfjs-current-outline-item-button-label = Aktualny rozrjadowy zapisk
pdfjs-findbar-button =
    .title = W dokumenće pytać
pdfjs-findbar-button-label = Pytać
pdfjs-additional-layers = Dalše woršty

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Strona { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura strony { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Pytać
    .placeholder = W dokumenće pytać…
pdfjs-find-previous-button =
    .title = Předchadne wustupowanje pytanskeho wuraza pytać
pdfjs-find-previous-button-label = Wróćo
pdfjs-find-next-button =
    .title = Přichodne wustupowanje pytanskeho wuraza pytać
pdfjs-find-next-button-label = Dale
pdfjs-find-highlight-checkbox = Wšě wuzběhnyć
pdfjs-find-match-case-checkbox-label = Wulkopisanje wobkedźbować
pdfjs-find-match-diacritics-checkbox-label = Diakritiske znamješka wužiwać
pdfjs-find-entire-word-checkbox-label = Cyłe słowa
pdfjs-find-reached-top = Spočatk dokumenta docpěty, pokročuje so z kóncom
pdfjs-find-reached-bottom = Kónc dokument docpěty, pokročuje so ze spočatkom
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } z { $total } wotpowědnika
        [two] { $current } z { $total } wotpowědnikow
        [few] { $current } z { $total } wotpowědnikow
       *[other] { $current } z { $total } wotpowědnikow
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Wyše { $limit } wotpowědnik
        [two] Wyše { $limit } wotpowědnikaj
        [few] Wyše { $limit } wotpowědniki
       *[other] Wyše { $limit } wotpowědnikow
    }
pdfjs-find-not-found = Pytanski wuraz njeje so namakał

## Predefined zoom values

pdfjs-page-scale-width = Šěrokosć strony
pdfjs-page-scale-fit = Wulkosć strony
pdfjs-page-scale-auto = Awtomatiske skalowanje
pdfjs-page-scale-actual = Aktualna wulkosć
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Strona { $page }

## Loading indicator messages

pdfjs-loading-error = Při začitowanju PDF je zmylk wustupił.
pdfjs-invalid-file-error = Njepłaćiwa abo wobškodźena PDF-dataja.
pdfjs-missing-file-error = Falowaca PDF-dataja.
pdfjs-unexpected-response-error = Njewočakowana serwerowa wotmołwa.
pdfjs-rendering-error = Při zwobraznjenju strony je zmylk wustupił.

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
    .alt = [Typ přispomnjenki: { $type }]

## Password

pdfjs-password-label = Zapodajće hesło, zo byšće PDF-dataju wočinił.
pdfjs-password-invalid = Njepłaćiwe hesło. Prošu spytajće hišće raz.
pdfjs-password-ok-button = W porjadku
pdfjs-password-cancel-button = Přetorhnyć
pdfjs-web-fonts-disabled = Webpisma su znjemóžnjene: njeje móžno, zasadźene PDF-pisma wužiwać.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-free-text-button-label = Tekst
pdfjs-editor-ink-button =
    .title = Rysować
pdfjs-editor-ink-button-label = Rysować
pdfjs-editor-stamp-button =
    .title = Wobrazy přidać abo wobdźěłać
pdfjs-editor-stamp-button-label = Wobrazy přidać abo wobdźěłać
pdfjs-editor-highlight-button =
    .title = Wuzběhnyć
pdfjs-editor-highlight-button-label = Wuzběhnyć
pdfjs-highlight-floating-button =
    .title = Wuzběhnyć
pdfjs-highlight-floating-button1 =
    .title = Wuzběhnjenje
    .aria-label = Wuzběhnjenje
pdfjs-highlight-floating-button-label = Wuzběhnjenje

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Rysowanku wotstronić
pdfjs-editor-remove-freetext-button =
    .title = Tekst wotstronić
pdfjs-editor-remove-stamp-button =
    .title = Wobraz wotstronić
pdfjs-editor-remove-highlight-button =
    .title = Wuzběhnjenje wotstronić

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Barba
pdfjs-editor-free-text-size-input = Wulkosć
pdfjs-editor-ink-color-input = Barba
pdfjs-editor-ink-thickness-input = Tołstosć
pdfjs-editor-ink-opacity-input = Opacita
pdfjs-editor-stamp-add-image-button =
    .title = Wobraz přidać
pdfjs-editor-stamp-add-image-button-label = Wobraz přidać
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Tołstosć
pdfjs-editor-free-highlight-thickness-title =
    .title = Tołstosć změnić, hdyž so zapiski wuzběhuja, kotrež tekst njejsu
pdfjs-free-text =
    .aria-label = Tekstowy editor
pdfjs-free-text-default-content = Započńće pisać…
pdfjs-ink =
    .aria-label = Rysowanski editor
pdfjs-ink-canvas =
    .aria-label = Wobraz wutworjeny wot wužiwarja

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternatiwny tekst
pdfjs-editor-alt-text-edit-button-label = Alternatiwny tekst wobdźěłać
pdfjs-editor-alt-text-dialog-label = Nastajenje wubrać
pdfjs-editor-alt-text-dialog-description = Alternatiwny tekst pomha, hdyž ludźo njemóža wobraz widźeć abo hdyž so wobraz njezačita.
pdfjs-editor-alt-text-add-description-label = Wopisanje přidać
pdfjs-editor-alt-text-add-description-description = Pisajće 1 sadu abo 2 sadźe, kotrejž temu, nastajenje abo akcije wopisujetej.
pdfjs-editor-alt-text-mark-decorative-label = Jako dekoratiwny markěrować
pdfjs-editor-alt-text-mark-decorative-description = To so za pyšace wobrazy wužiwa, na přikład ramiki abo wodowe znamjenja.
pdfjs-editor-alt-text-cancel-button = Přetorhnyć
pdfjs-editor-alt-text-save-button = Składować
pdfjs-editor-alt-text-decorative-tooltip = Jako dekoratiwny markěrowany
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Na přikład, „Młody muž za blidom sedźi, zo by jědź jědł“

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Horjeka nalěwo – wulkosć změnić
pdfjs-editor-resizer-label-top-middle = Horjeka wosrjedź – wulkosć změnić
pdfjs-editor-resizer-label-top-right = Horjeka naprawo – wulkosć změnić
pdfjs-editor-resizer-label-middle-right = Wosrjedź naprawo – wulkosć změnić
pdfjs-editor-resizer-label-bottom-right = Deleka naprawo – wulkosć změnić
pdfjs-editor-resizer-label-bottom-middle = Deleka wosrjedź – wulkosć změnić
pdfjs-editor-resizer-label-bottom-left = Deleka nalěwo – wulkosć změnić
pdfjs-editor-resizer-label-middle-left = Wosrjedź nalěwo – wulkosć změnić

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Barba wuzběhnjenja
pdfjs-editor-colorpicker-button =
    .title = Barbu změnić
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Wuběr barbow
pdfjs-editor-colorpicker-yellow =
    .title = Žołty
pdfjs-editor-colorpicker-green =
    .title = Zeleny
pdfjs-editor-colorpicker-blue =
    .title = Módry
pdfjs-editor-colorpicker-pink =
    .title = Pink
pdfjs-editor-colorpicker-red =
    .title = Čerwjeny

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Wšě pokazać
pdfjs-editor-highlight-show-all-button =
    .title = Wšě pokazać
