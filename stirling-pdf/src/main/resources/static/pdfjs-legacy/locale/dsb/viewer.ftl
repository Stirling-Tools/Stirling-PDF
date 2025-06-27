# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pjerwjejšny bok
pdfjs-previous-button-label = Slědk
pdfjs-next-button =
    .title = Pśiducy bok
pdfjs-next-button-label = Dalej
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Bok
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = z { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } z { $pagesCount })
pdfjs-zoom-out-button =
    .title = Pómjeńšyś
pdfjs-zoom-out-button-label = Pómjeńšyś
pdfjs-zoom-in-button =
    .title = Pówětšyś
pdfjs-zoom-in-button-label = Pówětšyś
pdfjs-zoom-select =
    .title = Skalěrowanje
pdfjs-presentation-mode-button =
    .title = Do prezentaciskego modusa pśejś
pdfjs-presentation-mode-button-label = Prezentaciski modus
pdfjs-open-file-button =
    .title = Dataju wócyniś
pdfjs-open-file-button-label = Wócyniś
pdfjs-print-button =
    .title = Śišćaś
pdfjs-print-button-label = Śišćaś
pdfjs-save-button =
    .title = Składowaś
pdfjs-save-button-label = Składowaś
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Ześěgnuś
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Ześěgnuś
pdfjs-bookmark-button =
    .title = Aktualny bok (URL z aktualnego boka pokazaś)
pdfjs-bookmark-button-label = Aktualny bok
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = W nałoženju wócyniś
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = W nałoženju wócyniś

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Rědy
pdfjs-tools-button-label = Rědy
pdfjs-first-page-button =
    .title = K prědnemu bokoju
pdfjs-first-page-button-label = K prědnemu bokoju
pdfjs-last-page-button =
    .title = K slědnemu bokoju
pdfjs-last-page-button-label = K slědnemu bokoju
pdfjs-page-rotate-cw-button =
    .title = Wobwjertnuś ako špěra źo
pdfjs-page-rotate-cw-button-label = Wobwjertnuś ako špěra źo
pdfjs-page-rotate-ccw-button =
    .title = Wobwjertnuś nawopaki ako špěra źo
pdfjs-page-rotate-ccw-button-label = Wobwjertnuś nawopaki ako špěra źo
pdfjs-cursor-text-select-tool-button =
    .title = Rěd za wuběranje teksta zmóžniś
pdfjs-cursor-text-select-tool-button-label = Rěd za wuběranje teksta
pdfjs-cursor-hand-tool-button =
    .title = Rucny rěd zmóžniś
pdfjs-cursor-hand-tool-button-label = Rucny rěd
pdfjs-scroll-page-button =
    .title = Kulanje boka wužywaś
pdfjs-scroll-page-button-label = Kulanje boka
pdfjs-scroll-vertical-button =
    .title = Wertikalne suwanje wužywaś
pdfjs-scroll-vertical-button-label = Wertikalne suwanje
pdfjs-scroll-horizontal-button =
    .title = Horicontalne suwanje wužywaś
pdfjs-scroll-horizontal-button-label = Horicontalne suwanje
pdfjs-scroll-wrapped-button =
    .title = Pózlažke suwanje wužywaś
pdfjs-scroll-wrapped-button-label = Pózlažke suwanje
pdfjs-spread-none-button =
    .title = Boki njezwězaś
pdfjs-spread-none-button-label = Žeden dwójny bok
pdfjs-spread-odd-button =
    .title = Boki zachopinajucy z njerownymi bokami zwězaś
pdfjs-spread-odd-button-label = Njerowne boki
pdfjs-spread-even-button =
    .title = Boki zachopinajucy z rownymi bokami zwězaś
pdfjs-spread-even-button-label = Rowne boki

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumentowe kakosći…
pdfjs-document-properties-button-label = Dokumentowe kakosći…
pdfjs-document-properties-file-name = Mě dataje:
pdfjs-document-properties-file-size = Wjelikosć dataje:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bajtow)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bajtow)
pdfjs-document-properties-title = Titel:
pdfjs-document-properties-author = Awtor:
pdfjs-document-properties-subject = Tema:
pdfjs-document-properties-keywords = Klucowe słowa:
pdfjs-document-properties-creation-date = Datum napóranja:
pdfjs-document-properties-modification-date = Datum změny:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Awtor:
pdfjs-document-properties-producer = PDF-gótowaŕ:
pdfjs-document-properties-version = PDF-wersija:
pdfjs-document-properties-page-count = Licba bokow:
pdfjs-document-properties-page-size = Wjelikosć boka:
pdfjs-document-properties-page-size-unit-inches = col
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = wusoki format
pdfjs-document-properties-page-size-orientation-landscape = prěcny format
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
pdfjs-document-properties-linearized-yes = Jo
pdfjs-document-properties-linearized-no = Ně
pdfjs-document-properties-close-button = Zacyniś

## Print

pdfjs-print-progress-message = Dokument pśigótujo se za śišćanje…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Pśetergnuś
pdfjs-printing-not-supported = Warnowanje: Śišćanje njepódpěra se połnje pśez toś ten wobglědowak.
pdfjs-printing-not-ready = Warnowanje: PDF njejo se za śišćanje dopołnje zacytał.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Bócnicu pokazaś/schowaś
pdfjs-toggle-sidebar-notification-button =
    .title = Bocnicu pśešaltowaś (dokument rozrědowanje/pśipiski/warstwy wopśimujo)
pdfjs-toggle-sidebar-button-label = Bócnicu pokazaś/schowaś
pdfjs-document-outline-button =
    .title = Dokumentowe naraźenje pokazaś (dwójne kliknjenje, aby se wšykne zapiski pokazali/schowali)
pdfjs-document-outline-button-label = Dokumentowa struktura
pdfjs-attachments-button =
    .title = Pśidanki pokazaś
pdfjs-attachments-button-label = Pśidanki
pdfjs-layers-button =
    .title = Warstwy pokazaś (klikniśo dwójcy, aby wšykne warstwy na standardny staw slědk stajił)
pdfjs-layers-button-label = Warstwy
pdfjs-thumbs-button =
    .title = Miniatury pokazaś
pdfjs-thumbs-button-label = Miniatury
pdfjs-current-outline-item-button =
    .title = Aktualny rozrědowański zapisk pytaś
pdfjs-current-outline-item-button-label = Aktualny rozrědowański zapisk
pdfjs-findbar-button =
    .title = W dokumenśe pytaś
pdfjs-findbar-button-label = Pytaś
pdfjs-additional-layers = Dalšne warstwy

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Bok { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura boka { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Pytaś
    .placeholder = W dokumenśe pytaś…
pdfjs-find-previous-button =
    .title = Pjerwjejšne wustupowanje pytańskego wuraza pytaś
pdfjs-find-previous-button-label = Slědk
pdfjs-find-next-button =
    .title = Pśidujuce wustupowanje pytańskego wuraza pytaś
pdfjs-find-next-button-label = Dalej
pdfjs-find-highlight-checkbox = Wšykne wuzwignuś
pdfjs-find-match-case-checkbox-label = Na wjelikopisanje źiwaś
pdfjs-find-match-diacritics-checkbox-label = Diakritiske znamuška wužywaś
pdfjs-find-entire-word-checkbox-label = Cełe słowa
pdfjs-find-reached-top = Zachopjeńk dokumenta dostany, pókšacujo se z kóńcom
pdfjs-find-reached-bottom = Kóńc dokumenta dostany, pókšacujo se ze zachopjeńkom
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } z { $total } wótpowědnika
        [two] { $current } z { $total } wótpowědnikowu
        [few] { $current } z { $total } wótpowědnikow
       *[other] { $current } z { $total } wótpowědnikow
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Wušej { $limit } wótpowědnik
        [two] Wušej { $limit } wótpowědnika
        [few] Wušej { $limit } wótpowědniki
       *[other] Wušej { $limit } wótpowědniki
    }
pdfjs-find-not-found = Pytański wuraz njejo se namakał

## Predefined zoom values

pdfjs-page-scale-width = Šyrokosć boka
pdfjs-page-scale-fit = Wjelikosć boka
pdfjs-page-scale-auto = Awtomatiske skalěrowanje
pdfjs-page-scale-actual = Aktualna wjelikosć
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Bok { $page }

## Loading indicator messages

pdfjs-loading-error = Pśi zacytowanju PDF jo zmólka nastała.
pdfjs-invalid-file-error = Njepłaśiwa abo wobškóźona PDF-dataja.
pdfjs-missing-file-error = Felujuca PDF-dataja.
pdfjs-unexpected-response-error = Njewócakane serwerowe wótegrono.
pdfjs-rendering-error = Pśi zwobraznjanju boka jo zmólka nastała.

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
    .alt = [Typ pśipiskow: { $type }]

## Password

pdfjs-password-label = Zapódajśo gronidło, aby PDF-dataju wócynił.
pdfjs-password-invalid = Njepłaśiwe gronidło. Pšosym wopytajśo hyšći raz.
pdfjs-password-ok-button = W pórěźe
pdfjs-password-cancel-button = Pśetergnuś
pdfjs-web-fonts-disabled = Webpisma su znjemóžnjone: njejo móžno, zasajźone PDF-pisma wužywaś.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-free-text-button-label = Tekst
pdfjs-editor-ink-button =
    .title = Kresliś
pdfjs-editor-ink-button-label = Kresliś
pdfjs-editor-stamp-button =
    .title = Wobraze pśidaś abo wobźěłaś
pdfjs-editor-stamp-button-label = Wobraze pśidaś abo wobźěłaś
pdfjs-editor-highlight-button =
    .title = Wuzwignuś
pdfjs-editor-highlight-button-label = Wuzwignuś
pdfjs-highlight-floating-button =
    .title = Wuzwignjenje
pdfjs-highlight-floating-button1 =
    .title = Wuzwignuś
    .aria-label = Wuzwignuś
pdfjs-highlight-floating-button-label = Wuzwignuś

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Kreslanku wótwónoźeś
pdfjs-editor-remove-freetext-button =
    .title = Tekst wótwónoźeś
pdfjs-editor-remove-stamp-button =
    .title = Wobraz wótwónoźeś
pdfjs-editor-remove-highlight-button =
    .title = Wuzwignjenje wótpóraś

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Barwa
pdfjs-editor-free-text-size-input = Wjelikosć
pdfjs-editor-ink-color-input = Barwa
pdfjs-editor-ink-thickness-input = Tłustosć
pdfjs-editor-ink-opacity-input = Opacita
pdfjs-editor-stamp-add-image-button =
    .title = Wobraz pśidaś
pdfjs-editor-stamp-add-image-button-label = Wobraz pśidaś
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Tłustosć
pdfjs-editor-free-highlight-thickness-title =
    .title = Tłustosć změniś, gaž se zapiski wuzwiguju, kótarež tekst njejsu
pdfjs-free-text =
    .aria-label = Tekstowy editor
pdfjs-free-text-default-content = Zachopśo pisaś…
pdfjs-ink =
    .aria-label = Kresleński editor
pdfjs-ink-canvas =
    .aria-label = Wobraz napórany wót wužywarja

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternatiwny tekst
pdfjs-editor-alt-text-edit-button-label = Alternatiwny tekst wobźěłaś
pdfjs-editor-alt-text-dialog-label = Nastajenje wubraś
pdfjs-editor-alt-text-dialog-description = Alternatiwny tekst pomaga, gaž luźe njamógu wobraz wiźeś abo gaž se wobraz njezacytajo.
pdfjs-editor-alt-text-add-description-label = Wopisanje pśidaś
pdfjs-editor-alt-text-add-description-description = Pišćo 1 sadu abo 2 saźe, kótarejž temu, nastajenje abo akcije wopisujotej.
pdfjs-editor-alt-text-mark-decorative-label = Ako dekoratiwny markěrowaś
pdfjs-editor-alt-text-mark-decorative-description = To se za pyšnjece wobraze wužywa, na pśikład ramiki abo wódowe znamjenja.
pdfjs-editor-alt-text-cancel-button = Pśetergnuś
pdfjs-editor-alt-text-save-button = Składowaś
pdfjs-editor-alt-text-decorative-tooltip = Ako dekoratiwny markěrowany
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Na pśikład, „Młody muski za blidom sejźi, aby jěź jědł“

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Górjejce nalěwo – wjelikosć změniś
pdfjs-editor-resizer-label-top-middle = Górjejce wesrjejź – wjelikosć změniś
pdfjs-editor-resizer-label-top-right = Górjejce napšawo – wjelikosć změniś
pdfjs-editor-resizer-label-middle-right = Wesrjejź napšawo – wjelikosć změniś
pdfjs-editor-resizer-label-bottom-right = Dołojce napšawo – wjelikosć změniś
pdfjs-editor-resizer-label-bottom-middle = Dołojce wesrjejź – wjelikosć změniś
pdfjs-editor-resizer-label-bottom-left = Dołojce nalěwo – wjelikosć změniś
pdfjs-editor-resizer-label-middle-left = Wesrjejź nalěwo – wjelikosć změniś

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Barwa wuzwignjenja
pdfjs-editor-colorpicker-button =
    .title = Barwu změniś
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Wuběrk barwow
pdfjs-editor-colorpicker-yellow =
    .title = Žołty
pdfjs-editor-colorpicker-green =
    .title = Zeleny
pdfjs-editor-colorpicker-blue =
    .title = Módry
pdfjs-editor-colorpicker-pink =
    .title = Pink
pdfjs-editor-colorpicker-red =
    .title = Cerwjeny

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Wšykne pokazaś
pdfjs-editor-highlight-show-all-button =
    .title = Wšykne pokazaś
