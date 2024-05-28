# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Hello Ɓennungo
pdfjs-previous-button-label = Ɓennuɗo
pdfjs-next-button =
    .title = Hello faango
pdfjs-next-button-label = Yeeso
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Hello
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = e nder { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } of { $pagesCount })
pdfjs-zoom-out-button =
    .title = Lonngo Woɗɗa
pdfjs-zoom-out-button-label = Lonngo Woɗɗa
pdfjs-zoom-in-button =
    .title = Lonngo Ara
pdfjs-zoom-in-button-label = Lonngo Ara
pdfjs-zoom-select =
    .title = Lonngo
pdfjs-presentation-mode-button =
    .title = Faytu to  Presentation Mode
pdfjs-presentation-mode-button-label = Presentation Mode
pdfjs-open-file-button =
    .title = Uddit Fiilde
pdfjs-open-file-button-label = Uddit
pdfjs-print-button =
    .title = Winndito
pdfjs-print-button-label = Winndito

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Kuutorɗe
pdfjs-tools-button-label = Kuutorɗe
pdfjs-first-page-button =
    .title = Yah to hello adanngo
pdfjs-first-page-button-label = Yah to hello adanngo
pdfjs-last-page-button =
    .title = Yah to hello wattindiingo
pdfjs-last-page-button-label = Yah to hello wattindiingo
pdfjs-page-rotate-cw-button =
    .title = Yiiltu Faya Ñaamo
pdfjs-page-rotate-cw-button-label = Yiiltu Faya Ñaamo
pdfjs-page-rotate-ccw-button =
    .title = Yiiltu Faya Nano
pdfjs-page-rotate-ccw-button-label = Yiiltu Faya Nano
pdfjs-cursor-text-select-tool-button =
    .title = Gollin kaɓirgel cuɓirgel binndi
pdfjs-cursor-text-select-tool-button-label = Kaɓirgel cuɓirgel binndi
pdfjs-cursor-hand-tool-button =
    .title = Hurmin kuutorgal junngo
pdfjs-cursor-hand-tool-button-label = Kaɓirgel junngo
pdfjs-scroll-vertical-button =
    .title = Huutoro gorwitol daringol
pdfjs-scroll-vertical-button-label = Gorwitol daringol
pdfjs-scroll-horizontal-button =
    .title = Huutoro gorwitol lelingol
pdfjs-scroll-horizontal-button-label = Gorwitol daringol
pdfjs-scroll-wrapped-button =
    .title = Huutoro gorwitol coomingol
pdfjs-scroll-wrapped-button-label = Gorwitol coomingol
pdfjs-spread-none-button =
    .title = Hoto tawtu kelle kelle
pdfjs-spread-none-button-label = Alaa Spreads
pdfjs-spread-odd-button =
    .title = Tawtu kelle puɗɗortooɗe kelle teelɗe
pdfjs-spread-odd-button-label = Kelle teelɗe
pdfjs-spread-even-button =
    .title = Tawtu ɗereeji kelle puɗɗoriiɗi kelle teeltuɗe
pdfjs-spread-even-button-label = Kelle teeltuɗe

## Document properties dialog

pdfjs-document-properties-button =
    .title = Keeroraaɗi Winndannde…
pdfjs-document-properties-button-label = Keeroraaɗi Winndannde…
pdfjs-document-properties-file-name = Innde fiilde:
pdfjs-document-properties-file-size = Ɓetol fiilde:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bite)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bite)
pdfjs-document-properties-title = Tiitoonde:
pdfjs-document-properties-author = Binnduɗo:
pdfjs-document-properties-subject = Toɓɓere:
pdfjs-document-properties-keywords = Kelmekele jiytirɗe:
pdfjs-document-properties-creation-date = Ñalnde Sosaa:
pdfjs-document-properties-modification-date = Ñalnde Waylaa:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Cosɗo:
pdfjs-document-properties-producer = Paggiiɗo PDF:
pdfjs-document-properties-version = Yamre PDF:
pdfjs-document-properties-page-count = Limoore Kelle:
pdfjs-document-properties-page-size = Ɓeto Hello:
pdfjs-document-properties-page-size-unit-inches = nder
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = dariingo
pdfjs-document-properties-page-size-orientation-landscape = wertiingo
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Ɓataake
pdfjs-document-properties-page-size-name-legal = Laawol

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
pdfjs-document-properties-linearized = Ɗisngo geese yaawngo:
pdfjs-document-properties-linearized-yes = Eey
pdfjs-document-properties-linearized-no = Alaa
pdfjs-document-properties-close-button = Uddu

## Print

pdfjs-print-progress-message = Nana heboo winnditaade fiilannde…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Haaytu
pdfjs-printing-not-supported = Reentino: Winnditagol tammbitaaka no feewi e ndee wanngorde.
pdfjs-printing-not-ready = Reentino: PDF oo loowaaki haa timmi ngam winnditagol.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Toggilo Palal Sawndo
pdfjs-toggle-sidebar-button-label = Toggilo Palal Sawndo
pdfjs-document-outline-button =
    .title = Hollu Ƴiyal Fiilannde (dobdobo ngam wertude/taggude teme fof)
pdfjs-document-outline-button-label = Toɓɓe Fiilannde
pdfjs-attachments-button =
    .title = Hollu Ɗisanɗe
pdfjs-attachments-button-label = Ɗisanɗe
pdfjs-thumbs-button =
    .title = Hollu Dooɓe
pdfjs-thumbs-button-label = Dooɓe
pdfjs-findbar-button =
    .title = Yiylo e fiilannde
pdfjs-findbar-button-label = Yiytu

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Hello { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Dooɓre Hello { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Yiytu
    .placeholder = Yiylo nder dokimaa
pdfjs-find-previous-button =
    .title = Yiylo cilol ɓennugol konngol ngol
pdfjs-find-previous-button-label = Ɓennuɗo
pdfjs-find-next-button =
    .title = Yiylo cilol garowol konngol ngol
pdfjs-find-next-button-label = Yeeso
pdfjs-find-highlight-checkbox = Jalbin fof
pdfjs-find-match-case-checkbox-label = Jaaɓnu darnde
pdfjs-find-entire-word-checkbox-label = Kelme timmuɗe tan
pdfjs-find-reached-top = Heɓii fuɗɗorde fiilannde, jokku faya les
pdfjs-find-reached-bottom = Heɓii hoore fiilannde, jokku faya les
pdfjs-find-not-found = Konngi njiyataa

## Predefined zoom values

pdfjs-page-scale-width = Njaajeendi Hello
pdfjs-page-scale-fit = Keƴeendi Hello
pdfjs-page-scale-auto = Loongorde Jaajol
pdfjs-page-scale-actual = Ɓetol Jaati
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = Juumre waɗii tuma nde loowata PDF oo.
pdfjs-invalid-file-error = Fiilde PDF moƴƴaani walla jiibii.
pdfjs-missing-file-error = Fiilde PDF ena ŋakki.
pdfjs-unexpected-response-error = Jaabtol sarworde tijjinooka.
pdfjs-rendering-error = Juumre waɗii tuma nde yoŋkittoo hello.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } Siiftannde]

## Password

pdfjs-password-label = Naatu finnde ngam uddite ndee fiilde PDF.
pdfjs-password-invalid = Finnde moƴƴaani. Tiiɗno eto kadi.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Haaytu
pdfjs-web-fonts-disabled = Ponte geese ko daaƴaaɗe: horiima huutoraade ponte PDF coomtoraaɗe.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

