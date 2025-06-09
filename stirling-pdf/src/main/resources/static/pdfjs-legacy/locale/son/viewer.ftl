# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Moo bisante
pdfjs-previous-button-label = Bisante
pdfjs-next-button =
    .title = Jinehere moo
pdfjs-next-button-label = Jine
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Moo
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } ra
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } ka hun { $pagesCount }) ra
pdfjs-zoom-out-button =
    .title = Nakasandi
pdfjs-zoom-out-button-label = Nakasandi
pdfjs-zoom-in-button =
    .title = Bebbeerandi
pdfjs-zoom-in-button-label = Bebbeerandi
pdfjs-zoom-select =
    .title = Bebbeerandi
pdfjs-presentation-mode-button =
    .title = Bere cebeyan alhaali
pdfjs-presentation-mode-button-label = Cebeyan alhaali
pdfjs-open-file-button =
    .title = Tuku feeri
pdfjs-open-file-button-label = Feeri
pdfjs-print-button =
    .title = Kar
pdfjs-print-button-label = Kar

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Goyjinawey
pdfjs-tools-button-label = Goyjinawey
pdfjs-first-page-button =
    .title = Koy moo jinaa ga
pdfjs-first-page-button-label = Koy moo jinaa ga
pdfjs-last-page-button =
    .title = Koy moo koraa ga
pdfjs-last-page-button-label = Koy moo koraa ga
pdfjs-page-rotate-cw-button =
    .title = Kuubi kanbe guma here
pdfjs-page-rotate-cw-button-label = Kuubi kanbe guma here
pdfjs-page-rotate-ccw-button =
    .title = Kuubi kanbe wowa here
pdfjs-page-rotate-ccw-button-label = Kuubi kanbe wowa here

## Document properties dialog

pdfjs-document-properties-button =
    .title = Takadda mayrawey…
pdfjs-document-properties-button-label = Takadda mayrawey…
pdfjs-document-properties-file-name = Tuku maa:
pdfjs-document-properties-file-size = Tuku adadu:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = KB { $size_kb } (cebsu-ize { $size_b })
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = MB { $size_mb } (cebsu-ize { $size_b })
pdfjs-document-properties-title = Tiiramaa:
pdfjs-document-properties-author = Hantumkaw:
pdfjs-document-properties-subject = Dalil:
pdfjs-document-properties-keywords = Kufalkalimawey:
pdfjs-document-properties-creation-date = Teeyan han:
pdfjs-document-properties-modification-date = Barmayan han:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Teekaw:
pdfjs-document-properties-producer = PDF berandikaw:
pdfjs-document-properties-version = PDF dumi:
pdfjs-document-properties-page-count = Moo hinna:

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page


##

pdfjs-document-properties-close-button = Daabu

## Print

pdfjs-print-progress-message = Goo ma takaddaa soolu k'a kar se…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Naŋ
pdfjs-printing-not-supported = Yaamar: Karyan ši tee ka timme nda ceecikaa woo.
pdfjs-printing-not-ready = Yaamar: PDF ši zunbu ka timme karyan še.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Kanjari ceraw zuu
pdfjs-toggle-sidebar-button-label = Kanjari ceraw zuu
pdfjs-document-outline-button =
    .title = Takaddaa korfur alhaaloo cebe (naagu cee hinka ka haya-izey kul hayandi/kankamandi)
pdfjs-document-outline-button-label = Takadda filla-boŋ
pdfjs-attachments-button =
    .title = Hangarey cebe
pdfjs-attachments-button-label = Hangarey
pdfjs-thumbs-button =
    .title = Kabeboy biyey cebe
pdfjs-thumbs-button-label = Kabeboy biyey
pdfjs-findbar-button =
    .title = Ceeci takaddaa ra
pdfjs-findbar-button-label = Ceeci

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = { $page } moo
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Kabeboy bii { $page } moo še

## Find panel button title and messages

pdfjs-find-input =
    .title = Ceeci
    .placeholder = Ceeci takaddaa ra…
pdfjs-find-previous-button =
    .title = Kalimaɲaŋoo bangayri bisantaa ceeci
pdfjs-find-previous-button-label = Bisante
pdfjs-find-next-button =
    .title = Kalimaɲaŋoo hiino bangayroo ceeci
pdfjs-find-next-button-label = Jine
pdfjs-find-highlight-checkbox = Ikul šilbay
pdfjs-find-match-case-checkbox-label = Harfu-beeriyan hawgay
pdfjs-find-reached-top = A too moŋoo boŋoo, koy jine ka šinitin nda cewoo
pdfjs-find-reached-bottom = A too moɲoo cewoo, koy jine šintioo ga
pdfjs-find-not-found = Kalimaɲaa mana duwandi

## Predefined zoom values

pdfjs-page-scale-width = Mooo hayyan
pdfjs-page-scale-fit = Moo sawayan
pdfjs-page-scale-auto = Boŋše azzaati barmayyan
pdfjs-page-scale-actual = Adadu cimi
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = Firka bangay kaŋ PDF goo ma zumandi.
pdfjs-invalid-file-error = PDF tuku laala wala laybante.
pdfjs-missing-file-error = PDF tuku kumante.
pdfjs-unexpected-response-error = Manti feršikaw tuuruyan maatante.
pdfjs-rendering-error = Firka bangay kaŋ moɲoo goo ma willandi.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = { $type } maasa-caw]

## Password

pdfjs-password-label = Šennikufal dam ka PDF tukoo woo feeri.
pdfjs-password-invalid = Šennikufal laalo. Ceeci koyne taare.
pdfjs-password-ok-button = Ayyo
pdfjs-password-cancel-button = Naŋ
pdfjs-web-fonts-disabled = Interneti šigirawey kay: ši hin ka goy nda PDF šigira hurantey.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

