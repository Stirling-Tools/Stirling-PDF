# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Jun kan ruxaq
pdfjs-previous-button-label = Jun kan
pdfjs-next-button =
    .title = Jun chik ruxaq
pdfjs-next-button-label = Jun chik
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Ruxaq
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = richin { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } richin { $pagesCount })
pdfjs-zoom-out-button =
    .title = Tich'utinirisäx
pdfjs-zoom-out-button-label = Tich'utinirisäx
pdfjs-zoom-in-button =
    .title = Tinimirisäx
pdfjs-zoom-in-button-label = Tinimirisäx
pdfjs-zoom-select =
    .title = Sum
pdfjs-presentation-mode-button =
    .title = Tijal ri rub'anikil niwachin
pdfjs-presentation-mode-button-label = Pa rub'eyal niwachin
pdfjs-open-file-button =
    .title = Tijaq Yakb'äl
pdfjs-open-file-button-label = Tijaq
pdfjs-print-button =
    .title = Titz'ajb'äx
pdfjs-print-button-label = Titz'ajb'äx
pdfjs-save-button =
    .title = Tiyak
pdfjs-save-button-label = Tiyak
pdfjs-bookmark-button-label = Ruxaq k'o wakami

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Samajib'äl
pdfjs-tools-button-label = Samajib'äl
pdfjs-first-page-button =
    .title = Tib'e pa nab'ey ruxaq
pdfjs-first-page-button-label = Tib'e pa nab'ey ruxaq
pdfjs-last-page-button =
    .title = Tib'e pa ruk'isib'äl ruxaq
pdfjs-last-page-button-label = Tib'e pa ruk'isib'äl ruxaq
pdfjs-page-rotate-cw-button =
    .title = Tisutïx pan ajkiq'a'
pdfjs-page-rotate-cw-button-label = Tisutïx pan ajkiq'a'
pdfjs-page-rotate-ccw-button =
    .title = Tisutïx pan ajxokon
pdfjs-page-rotate-ccw-button-label = Tisutïx pan ajxokon
pdfjs-cursor-text-select-tool-button =
    .title = Titzij ri rusamajib'al Rucha'ik Rucholajem Tzij
pdfjs-cursor-text-select-tool-button-label = Rusamajib'al Rucha'ik Rucholajem Tzij
pdfjs-cursor-hand-tool-button =
    .title = Titzij ri q'ab'aj samajib'äl
pdfjs-cursor-hand-tool-button-label = Q'ab'aj Samajib'äl
pdfjs-scroll-page-button =
    .title = Tokisäx Ruxaq Q'axanem
pdfjs-scroll-page-button-label = Ruxaq Q'axanem
pdfjs-scroll-vertical-button =
    .title = Tokisäx Pa'äl Q'axanem
pdfjs-scroll-vertical-button-label = Pa'äl Q'axanem
pdfjs-scroll-horizontal-button =
    .title = Tokisäx Kotz'öl Q'axanem
pdfjs-scroll-horizontal-button-label = Kotz'öl Q'axanem
pdfjs-scroll-wrapped-button =
    .title = Tokisäx Tzub'aj Q'axanem
pdfjs-scroll-wrapped-button-label = Tzub'aj Q'axanem
pdfjs-spread-none-button =
    .title = Man ketun taq ruxaq pa rub'eyal wuj
pdfjs-spread-none-button-label = Majun Rub'eyal
pdfjs-spread-odd-button =
    .title = Ke'atunu' ri taq ruxaq rik'in natikirisaj rik'in jun man k'ulaj ta rajilab'al
pdfjs-spread-odd-button-label = Man K'ulaj Ta Rub'eyal
pdfjs-spread-even-button =
    .title = Ke'atunu' ri taq ruxaq rik'in natikirisaj rik'in jun k'ulaj rajilab'al
pdfjs-spread-even-button-label = K'ulaj Rub'eyal

## Document properties dialog

pdfjs-document-properties-button =
    .title = Taq richinil wuj…
pdfjs-document-properties-button-label = Taq richinil wuj…
pdfjs-document-properties-file-name = Rub'i' yakb'äl:
pdfjs-document-properties-file-size = Runimilem yakb'äl:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = B'i'aj:
pdfjs-document-properties-author = B'anel:
pdfjs-document-properties-subject = Taqikil:
pdfjs-document-properties-keywords = Kixe'el taq tzij:
pdfjs-document-properties-creation-date = Ruq'ijul xtz'uk:
pdfjs-document-properties-modification-date = Ruq'ijul xjalwachïx:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Q'inonel:
pdfjs-document-properties-producer = PDF b'anöy:
pdfjs-document-properties-version = PDF ruwäch:
pdfjs-document-properties-page-count = Jarupe' ruxaq:
pdfjs-document-properties-page-size = Runimilem ri Ruxaq:
pdfjs-document-properties-page-size-unit-inches = pa
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = rupalem
pdfjs-document-properties-page-size-orientation-landscape = rukotz'olem
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Loman wuj
pdfjs-document-properties-page-size-name-legal = Taqanel tzijol

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
pdfjs-document-properties-linearized = Anin Rutz'etik Ajk'amaya'l:
pdfjs-document-properties-linearized-yes = Ja'
pdfjs-document-properties-linearized-no = Mani
pdfjs-document-properties-close-button = Titz'apïx

## Print

pdfjs-print-progress-message = Ruchojmirisaxik wuj richin nitz'ajb'äx…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Tiq'at
pdfjs-printing-not-supported = Rutzijol k'ayewal: Ri rutz'ajb'axik man koch'el ta ronojel pa re okik'amaya'l re'.
pdfjs-printing-not-ready = Rutzijol k'ayewal: Ri PDF man xusamajij ta ronojel richin nitz'ajb'äx.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Tijal ri ajxikin kajtz'ik
pdfjs-toggle-sidebar-notification-button =
    .title = Tik'ex ri ajxikin yuqkajtz'ik (ri wuj eruk'wan taq ruchi'/taqo/kuchuj)
pdfjs-toggle-sidebar-button-label = Tijal ri ajxikin kajtz'ik
pdfjs-document-outline-button =
    .title = Tik'ut pe ruch'akulal wuj (kamul-pitz'oj richin nirik'/nich'utinirisäx ronojel ruch'akulal)
pdfjs-document-outline-button-label = Ruch'akulal wuj
pdfjs-attachments-button =
    .title = Kek'ut pe ri taq taqoj
pdfjs-attachments-button-label = Taq taqoj
pdfjs-layers-button =
    .title = Kek'ut taq Kuchuj (ka'i'-pitz' richin yetzolïx ronojel ri taq kuchuj e k'o wi)
pdfjs-layers-button-label = Taq kuchuj
pdfjs-thumbs-button =
    .title = Kek'ut pe taq ch'utiq
pdfjs-thumbs-button-label = Koköj
pdfjs-current-outline-item-button =
    .title = Kekanöx  Taq Ch'akulal Kik'wan Chib'äl
pdfjs-current-outline-item-button-label = Taq Ch'akulal Kik'wan Chib'äl
pdfjs-findbar-button =
    .title = Tikanöx chupam ri wuj
pdfjs-findbar-button-label = Tikanöx
pdfjs-additional-layers = Tz'aqat ta Kuchuj

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Ruxaq { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Ruch'utinirisaxik ruxaq { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Tikanöx
    .placeholder = Tikanöx pa wuj…
pdfjs-find-previous-button =
    .title = Tib'an b'enam pa ri jun kan q'aptzij xilitäj
pdfjs-find-previous-button-label = Jun kan
pdfjs-find-next-button =
    .title = Tib'e pa ri jun chik pajtzij xilitäj
pdfjs-find-next-button-label = Jun chik
pdfjs-find-highlight-checkbox = Tiya' retal ronojel
pdfjs-find-match-case-checkbox-label = Tuk'äm ri' kik'in taq nimatz'ib' chuqa' taq ch'utitz'ib'
pdfjs-find-match-diacritics-checkbox-label = Tiya' Kikojol Tz'aqat taq Tz'ib'
pdfjs-find-entire-word-checkbox-label = Tz'aqät taq tzij
pdfjs-find-reached-top = Xb'eq'i' ri rutikirib'al wuj, xtikanöx k'a pa ruk'isib'äl
pdfjs-find-reached-bottom = Xb'eq'i' ri ruk'isib'äl wuj, xtikanöx pa rutikirib'al
pdfjs-find-not-found = Man xilitäj ta ri pajtzij

## Predefined zoom values

pdfjs-page-scale-width = Ruwa ruxaq
pdfjs-page-scale-fit = Tinuk' ruxaq
pdfjs-page-scale-auto = Yonil chi nimilem
pdfjs-page-scale-actual = Runimilem Wakami
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Ruxaq { $page }

## Loading indicator messages

pdfjs-loading-error = Xk'ulwachitäj jun sach'oj toq xnuk'ux ri PDF .
pdfjs-invalid-file-error = Man oke ta o yujtajinäq ri PDF yakb'äl.
pdfjs-missing-file-error = Man xilitäj ta ri PDF yakb'äl.
pdfjs-unexpected-response-error = Man oyob'en ta tz'olin rutzij ruk'u'x samaj.
pdfjs-rendering-error = Xk'ulwachitäj jun sachoj toq ninuk'wachij ri ruxaq.

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
    .alt = [{ $type } Tz'ib'anïk]

## Password

pdfjs-password-label = Tatz'ib'aj ri ewan tzij richin najäq re yakb'äl re' pa PDF.
pdfjs-password-invalid = Man okel ta ri ewan tzij: Tatojtob'ej chik.
pdfjs-password-ok-button = Ütz
pdfjs-password-cancel-button = Tiq'at
pdfjs-web-fonts-disabled = E chupül ri taq ajk'amaya'l tz'ib': man tikirel ta nokisäx ri taq tz'ib' PDF pa ch'ikenïk

## Editing

pdfjs-editor-free-text-button =
    .title = Rucholajem tz'ib'
pdfjs-editor-free-text-button-label = Rucholajem tz'ib'
pdfjs-editor-ink-button =
    .title = Tiwachib'ëx
pdfjs-editor-ink-button-label = Tiwachib'ëx
# Editor Parameters
pdfjs-editor-free-text-color-input = B'onil
pdfjs-editor-free-text-size-input = Nimilem
pdfjs-editor-ink-color-input = B'onil
pdfjs-editor-ink-thickness-input = Rupimil
pdfjs-editor-ink-opacity-input = Q'equmal
pdfjs-free-text =
    .aria-label = Nuk'unel tz'ib'atzij
pdfjs-free-text-default-content = Titikitisäx rutz'ib'axik…
pdfjs-ink =
    .aria-label = Nuk'unel wachib'äl
pdfjs-ink-canvas =
    .aria-label = Wachib'äl nuk'un ruma okisaxel

## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

