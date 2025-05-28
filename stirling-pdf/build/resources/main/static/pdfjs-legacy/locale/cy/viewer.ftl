# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Tudalen Flaenorol
pdfjs-previous-button-label = Blaenorol
pdfjs-next-button =
    .title = Tudalen Nesaf
pdfjs-next-button-label = Nesaf
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Tudalen
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = o { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } o { $pagesCount })
pdfjs-zoom-out-button =
    .title = Lleihau
pdfjs-zoom-out-button-label = Lleihau
pdfjs-zoom-in-button =
    .title = Cynyddu
pdfjs-zoom-in-button-label = Cynyddu
pdfjs-zoom-select =
    .title = Chwyddo
pdfjs-presentation-mode-button =
    .title = Newid i'r Modd Cyflwyno
pdfjs-presentation-mode-button-label = Modd Cyflwyno
pdfjs-open-file-button =
    .title = Agor Ffeil
pdfjs-open-file-button-label = Agor
pdfjs-print-button =
    .title = Argraffu
pdfjs-print-button-label = Argraffu
pdfjs-save-button =
    .title = Cadw
pdfjs-save-button-label = Cadw
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Llwytho i lawr
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Llwytho i lawr
pdfjs-bookmark-button =
    .title = Tudalen Gyfredol (Gweld URL o'r Dudalen Gyfredol)
pdfjs-bookmark-button-label = Tudalen Gyfredol
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Agor yn yr ap
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Agor yn yr ap

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Offer
pdfjs-tools-button-label = Offer
pdfjs-first-page-button =
    .title = Mynd i'r Dudalen Gyntaf
pdfjs-first-page-button-label = Mynd i'r Dudalen Gyntaf
pdfjs-last-page-button =
    .title = Mynd i'r Dudalen Olaf
pdfjs-last-page-button-label = Mynd i'r Dudalen Olaf
pdfjs-page-rotate-cw-button =
    .title = Cylchdroi Clocwedd
pdfjs-page-rotate-cw-button-label = Cylchdroi Clocwedd
pdfjs-page-rotate-ccw-button =
    .title = Cylchdroi Gwrthglocwedd
pdfjs-page-rotate-ccw-button-label = Cylchdroi Gwrthglocwedd
pdfjs-cursor-text-select-tool-button =
    .title = Galluogi Dewis Offeryn Testun
pdfjs-cursor-text-select-tool-button-label = Offeryn Dewis Testun
pdfjs-cursor-hand-tool-button =
    .title = Galluogi Offeryn Llaw
pdfjs-cursor-hand-tool-button-label = Offeryn Llaw
pdfjs-scroll-page-button =
    .title = Defnyddio Sgrolio Tudalen
pdfjs-scroll-page-button-label = Sgrolio Tudalen
pdfjs-scroll-vertical-button =
    .title = Defnyddio Sgrolio Fertigol
pdfjs-scroll-vertical-button-label = Sgrolio Fertigol
pdfjs-scroll-horizontal-button =
    .title = Defnyddio Sgrolio Llorweddol
pdfjs-scroll-horizontal-button-label = Sgrolio Llorweddol
pdfjs-scroll-wrapped-button =
    .title = Defnyddio Sgrolio Amlapio
pdfjs-scroll-wrapped-button-label = Sgrolio Amlapio
pdfjs-spread-none-button =
    .title = Peidio uno trawsdaleniadau
pdfjs-spread-none-button-label = Dim Trawsdaleniadau
pdfjs-spread-odd-button =
    .title = Uno trawsdaleniadau gan gychwyn gyda thudalennau odrif
pdfjs-spread-odd-button-label = Trawsdaleniadau Odrif
pdfjs-spread-even-button =
    .title = Uno trawsdaleniadau gan gychwyn gyda thudalennau eilrif
pdfjs-spread-even-button-label = Trawsdaleniadau Eilrif

## Document properties dialog

pdfjs-document-properties-button =
    .title = Priodweddau Dogfen…
pdfjs-document-properties-button-label = Priodweddau Dogfen…
pdfjs-document-properties-file-name = Enw ffeil:
pdfjs-document-properties-file-size = Maint ffeil:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } beit)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } beit)
pdfjs-document-properties-title = Teitl:
pdfjs-document-properties-author = Awdur:
pdfjs-document-properties-subject = Pwnc:
pdfjs-document-properties-keywords = Allweddair:
pdfjs-document-properties-creation-date = Dyddiad Creu:
pdfjs-document-properties-modification-date = Dyddiad Addasu:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Crewr:
pdfjs-document-properties-producer = Cynhyrchydd PDF:
pdfjs-document-properties-version = Fersiwn PDF:
pdfjs-document-properties-page-count = Cyfrif Tudalen:
pdfjs-document-properties-page-size = Maint Tudalen:
pdfjs-document-properties-page-size-unit-inches = o fewn
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = portread
pdfjs-document-properties-page-size-orientation-landscape = tirlun
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Llythyr
pdfjs-document-properties-page-size-name-legal = Cyfreithiol

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
pdfjs-document-properties-linearized = Golwg Gwe Cyflym:
pdfjs-document-properties-linearized-yes = Iawn
pdfjs-document-properties-linearized-no = Na
pdfjs-document-properties-close-button = Cau

## Print

pdfjs-print-progress-message = Paratoi dogfen ar gyfer ei hargraffu…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Diddymu
pdfjs-printing-not-supported = Rhybudd: Nid yw argraffu yn cael ei gynnal yn llawn gan y porwr.
pdfjs-printing-not-ready = Rhybudd: Nid yw'r PDF wedi ei lwytho'n llawn ar gyfer argraffu.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Toglo'r Bar Ochr
pdfjs-toggle-sidebar-notification-button =
    .title = Toglo'r Bar Ochr (mae'r ddogfen yn cynnwys amlinelliadau/atodiadau/haenau)
pdfjs-toggle-sidebar-button-label = Toglo'r Bar Ochr
pdfjs-document-outline-button =
    .title = Dangos Amlinell Dogfen (clic dwbl i ymestyn/cau pob eitem)
pdfjs-document-outline-button-label = Amlinelliad Dogfen
pdfjs-attachments-button =
    .title = Dangos Atodiadau
pdfjs-attachments-button-label = Atodiadau
pdfjs-layers-button =
    .title = Dangos Haenau (cliciwch ddwywaith i ailosod yr holl haenau i'r cyflwr rhagosodedig)
pdfjs-layers-button-label = Haenau
pdfjs-thumbs-button =
    .title = Dangos Lluniau Bach
pdfjs-thumbs-button-label = Lluniau Bach
pdfjs-current-outline-item-button =
    .title = Canfod yr Eitem Amlinellol Gyfredol
pdfjs-current-outline-item-button-label = Yr Eitem Amlinellol Gyfredol
pdfjs-findbar-button =
    .title = Canfod yn y Ddogfen
pdfjs-findbar-button-label = Canfod
pdfjs-additional-layers = Haenau Ychwanegol

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Tudalen { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Llun Bach Tudalen { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Canfod
    .placeholder = Canfod yn y ddogfen…
pdfjs-find-previous-button =
    .title = Canfod enghraifft flaenorol o'r ymadrodd
pdfjs-find-previous-button-label = Blaenorol
pdfjs-find-next-button =
    .title = Canfod enghraifft nesaf yr ymadrodd
pdfjs-find-next-button-label = Nesaf
pdfjs-find-highlight-checkbox = Amlygu Popeth
pdfjs-find-match-case-checkbox-label = Cydweddu Maint
pdfjs-find-match-diacritics-checkbox-label = Diacritigau Cyfatebol
pdfjs-find-entire-word-checkbox-label = Geiriau Cyfan
pdfjs-find-reached-top = Wedi cyrraedd brig y dudalen, parhau o'r gwaelod
pdfjs-find-reached-bottom = Wedi cyrraedd diwedd y dudalen, parhau o'r brig
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [zero] { $current } o { $total } cydweddiadau
        [one] { $current } o { $total } cydweddiad
        [two] { $current } o { $total } gydweddiad
        [few] { $current } o { $total } cydweddiad
        [many] { $current } o { $total } chydweddiad
       *[other] { $current } o { $total } cydweddiad
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [zero] Mwy nag { $limit } cydweddiadau
        [one] Mwy nag { $limit } cydweddiad
        [two] Mwy nag { $limit } gydweddiad
        [few] Mwy nag { $limit } cydweddiad
        [many] Mwy nag { $limit } chydweddiad
       *[other] Mwy nag { $limit } cydweddiad
    }
pdfjs-find-not-found = Heb ganfod ymadrodd

## Predefined zoom values

pdfjs-page-scale-width = Lled Tudalen
pdfjs-page-scale-fit = Ffit Tudalen
pdfjs-page-scale-auto = Chwyddo Awtomatig
pdfjs-page-scale-actual = Maint Gwirioneddol
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Tudalen { $page }

## Loading indicator messages

pdfjs-loading-error = Digwyddodd gwall wrth lwytho'r PDF.
pdfjs-invalid-file-error = Ffeil PDF annilys neu llwgr.
pdfjs-missing-file-error = Ffeil PDF coll.
pdfjs-unexpected-response-error = Ymateb annisgwyl gan y gweinydd.
pdfjs-rendering-error = Digwyddodd gwall wrth adeiladu'r dudalen.

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
    .alt = [Anodiad { $type } ]

## Password

pdfjs-password-label = Rhowch gyfrinair i agor y PDF.
pdfjs-password-invalid = Cyfrinair annilys. Ceisiwch eto.
pdfjs-password-ok-button = Iawn
pdfjs-password-cancel-button = Diddymu
pdfjs-web-fonts-disabled = Ffontiau gwe wedi eu hanalluogi: methu defnyddio ffontiau PDF mewnblanedig.

## Editing

pdfjs-editor-free-text-button =
    .title = Testun
pdfjs-editor-free-text-button-label = Testun
pdfjs-editor-ink-button =
    .title = Lluniadu
pdfjs-editor-ink-button-label = Lluniadu
pdfjs-editor-stamp-button =
    .title = Ychwanegu neu olygu delweddau
pdfjs-editor-stamp-button-label = Ychwanegu neu olygu delweddau
pdfjs-editor-highlight-button =
    .title = Amlygu
pdfjs-editor-highlight-button-label = Amlygu
pdfjs-highlight-floating-button =
    .title = Amlygu
pdfjs-highlight-floating-button1 =
    .title = Amlygu
    .aria-label = Amlygu
pdfjs-highlight-floating-button-label = Amlygu

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Dileu lluniad
pdfjs-editor-remove-freetext-button =
    .title = Dileu testun
pdfjs-editor-remove-stamp-button =
    .title = Dileu delwedd
pdfjs-editor-remove-highlight-button =
    .title = Tynnu amlygiad

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Lliw
pdfjs-editor-free-text-size-input = Maint
pdfjs-editor-ink-color-input = Lliw
pdfjs-editor-ink-thickness-input = Trwch
pdfjs-editor-ink-opacity-input = Didreiddedd
pdfjs-editor-stamp-add-image-button =
    .title = Ychwanegu delwedd
pdfjs-editor-stamp-add-image-button-label = Ychwanegu delwedd
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Trwch
pdfjs-editor-free-highlight-thickness-title =
    .title = Newid trwch wrth amlygu eitemau heblaw testun
pdfjs-free-text =
    .aria-label = Golygydd Testun
pdfjs-free-text-default-content = Cychwyn teipio…
pdfjs-ink =
    .aria-label = Golygydd Lluniadu
pdfjs-ink-canvas =
    .aria-label = Delwedd wedi'i chreu gan ddefnyddwyr

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Testun amgen (alt)
pdfjs-editor-alt-text-edit-button-label = Golygu testun amgen
pdfjs-editor-alt-text-dialog-label = Dewisiadau
pdfjs-editor-alt-text-dialog-description = Mae testun amgen (testun alt) yn helpu pan na all pobl weld y ddelwedd neu pan nad yw'n llwytho.
pdfjs-editor-alt-text-add-description-label = Ychwanegu disgrifiad
pdfjs-editor-alt-text-add-description-description = Anelwch at 1-2 frawddeg sy'n disgrifio'r pwnc, y cefndir neu'r gweithredoedd.
pdfjs-editor-alt-text-mark-decorative-label = Marcio fel addurniadol
pdfjs-editor-alt-text-mark-decorative-description = Mae'n cael ei ddefnyddio ar gyfer delweddau addurniadol, fel borderi neu farciau dŵr.
pdfjs-editor-alt-text-cancel-button = Diddymu
pdfjs-editor-alt-text-save-button = Cadw
pdfjs-editor-alt-text-decorative-tooltip = Marcio fel addurniadol
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Er enghraifft, “Mae dyn ifanc yn eistedd wrth fwrdd i fwyta pryd bwyd”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Y gornel chwith uchaf — newid maint
pdfjs-editor-resizer-label-top-middle = Canol uchaf - newid maint
pdfjs-editor-resizer-label-top-right = Y gornel dde uchaf - newid maint
pdfjs-editor-resizer-label-middle-right = De canol - newid maint
pdfjs-editor-resizer-label-bottom-right = Y gornel dde isaf — newid maint
pdfjs-editor-resizer-label-bottom-middle = Canol gwaelod — newid maint
pdfjs-editor-resizer-label-bottom-left = Y gornel chwith isaf — newid maint
pdfjs-editor-resizer-label-middle-left = Chwith canol — newid maint

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Lliw amlygu
pdfjs-editor-colorpicker-button =
    .title = Newid lliw
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Dewisiadau lliw
pdfjs-editor-colorpicker-yellow =
    .title = Melyn
pdfjs-editor-colorpicker-green =
    .title = Gwyrdd
pdfjs-editor-colorpicker-blue =
    .title = Glas
pdfjs-editor-colorpicker-pink =
    .title = Pinc
pdfjs-editor-colorpicker-red =
    .title = Coch

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Dangos y cyfan
pdfjs-editor-highlight-show-all-button =
    .title = Dangos y cyfan
