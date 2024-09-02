# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Īprīkšejā lopa
pdfjs-previous-button-label = Īprīkšejā
pdfjs-next-button =
    .title = Nuokomuo lopa
pdfjs-next-button-label = Nuokomuo
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Lopa
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = nu { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } nu { $pagesCount })
pdfjs-zoom-out-button =
    .title = Attuolynuot
pdfjs-zoom-out-button-label = Attuolynuot
pdfjs-zoom-in-button =
    .title = Pītuvynuot
pdfjs-zoom-in-button-label = Pītuvynuot
pdfjs-zoom-select =
    .title = Palelynuojums
pdfjs-presentation-mode-button =
    .title = Puorslēgtīs iz Prezentacejis režymu
pdfjs-presentation-mode-button-label = Prezentacejis režyms
pdfjs-open-file-button =
    .title = Attaiseit failu
pdfjs-open-file-button-label = Attaiseit
pdfjs-print-button =
    .title = Drukuošona
pdfjs-print-button-label = Drukōt

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Reiki
pdfjs-tools-button-label = Reiki
pdfjs-first-page-button =
    .title = Īt iz pyrmū lopu
pdfjs-first-page-button-label = Īt iz pyrmū lopu
pdfjs-last-page-button =
    .title = Īt iz piedejū lopu
pdfjs-last-page-button-label = Īt iz piedejū lopu
pdfjs-page-rotate-cw-button =
    .title = Pagrīzt pa pulksteni
pdfjs-page-rotate-cw-button-label = Pagrīzt pa pulksteni
pdfjs-page-rotate-ccw-button =
    .title = Pagrīzt pret pulksteni
pdfjs-page-rotate-ccw-button-label = Pagrīzt pret pulksteni
pdfjs-cursor-text-select-tool-button =
    .title = Aktivizēt teksta izvieles reiku
pdfjs-cursor-text-select-tool-button-label = Teksta izvieles reiks
pdfjs-cursor-hand-tool-button =
    .title = Aktivēt rūkys reiku
pdfjs-cursor-hand-tool-button-label = Rūkys reiks
pdfjs-scroll-vertical-button =
    .title = Izmontōt vertikalū ritinōšonu
pdfjs-scroll-vertical-button-label = Vertikalō ritinōšona
pdfjs-scroll-horizontal-button =
    .title = Izmontōt horizontalū ritinōšonu
pdfjs-scroll-horizontal-button-label = Horizontalō ritinōšona
pdfjs-scroll-wrapped-button =
    .title = Izmontōt mārūgojamū ritinōšonu
pdfjs-scroll-wrapped-button-label = Mārūgojamō ritinōšona
pdfjs-spread-none-button =
    .title = Naizmontōt lopu atvāruma režimu
pdfjs-spread-none-button-label = Bez atvārumim
pdfjs-spread-odd-button =
    .title = Izmontōt lopu atvārumus sōkut nu napōra numeru lopom
pdfjs-spread-odd-button-label = Napōra lopys pa kreisi
pdfjs-spread-even-button =
    .title = Izmontōt lopu atvārumus sōkut nu pōra numeru lopom
pdfjs-spread-even-button-label = Pōra lopys pa kreisi

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumenta īstatiejumi…
pdfjs-document-properties-button-label = Dokumenta īstatiejumi…
pdfjs-document-properties-file-name = Faila nūsaukums:
pdfjs-document-properties-file-size = Faila izmārs:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } biti)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } biti)
pdfjs-document-properties-title = Nūsaukums:
pdfjs-document-properties-author = Autors:
pdfjs-document-properties-subject = Tema:
pdfjs-document-properties-keywords = Atslāgi vuordi:
pdfjs-document-properties-creation-date = Izveides datums:
pdfjs-document-properties-modification-date = lobuošonys datums:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Radeituojs:
pdfjs-document-properties-producer = PDF producents:
pdfjs-document-properties-version = PDF verseja:
pdfjs-document-properties-page-count = Lopu skaits:
pdfjs-document-properties-page-size = Lopas izmārs:
pdfjs-document-properties-page-size-unit-inches = collas
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = portreta orientaceja
pdfjs-document-properties-page-size-orientation-landscape = ainovys orientaceja
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
pdfjs-document-properties-linearized-yes = Jā
pdfjs-document-properties-linearized-no = Nā
pdfjs-document-properties-close-button = Aiztaiseit

## Print

pdfjs-print-progress-message = Preparing document for printing…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Atceļt
pdfjs-printing-not-supported = Uzmaneibu: Drukuošona nu itei puorlūka dorbojās tikai daleji.
pdfjs-printing-not-ready = Uzmaneibu: PDF nav pilneibā īluodeits drukuošonai.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Puorslēgt suonu jūslu
pdfjs-toggle-sidebar-button-label = Puorslēgt suonu jūslu
pdfjs-document-outline-button =
    .title = Show Document Outline (double-click to expand/collapse all items)
pdfjs-document-outline-button-label = Dokumenta saturs
pdfjs-attachments-button =
    .title = Show Attachments
pdfjs-attachments-button-label = Attachments
pdfjs-thumbs-button =
    .title = Paruodeit seiktālus
pdfjs-thumbs-button-label = Seiktāli
pdfjs-findbar-button =
    .title = Mekleit dokumentā
pdfjs-findbar-button-label = Mekleit

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Lopa { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Lopys { $page } seiktāls

## Find panel button title and messages

pdfjs-find-input =
    .title = Mekleit
    .placeholder = Mekleit dokumentā…
pdfjs-find-previous-button =
    .title = Atrast īprīkšejū
pdfjs-find-previous-button-label = Īprīkšejā
pdfjs-find-next-button =
    .title = Atrast nuokamū
pdfjs-find-next-button-label = Nuokomuo
pdfjs-find-highlight-checkbox = Īkruosuot vysys
pdfjs-find-match-case-checkbox-label = Lelū, mozū burtu jiuteigs
pdfjs-find-reached-top = Sasnīgts dokumenta suokums, turpynojom nu beigom
pdfjs-find-reached-bottom = Sasnīgtys dokumenta beigys, turpynojom nu suokuma
pdfjs-find-not-found = Frāze nav atrosta

## Predefined zoom values

pdfjs-page-scale-width = Lopys plotumā
pdfjs-page-scale-fit = Ītylpynūt lopu
pdfjs-page-scale-auto = Automatiskais izmārs
pdfjs-page-scale-actual = Patīsais izmārs
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = Īluodejūt PDF nūtyka klaida.
pdfjs-invalid-file-error = Nadereigs voi būjuots PDF fails.
pdfjs-missing-file-error = PDF fails nav atrosts.
pdfjs-unexpected-response-error = Unexpected server response.
pdfjs-rendering-error = Attālojūt lopu rodās klaida

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } Annotation]

## Password

pdfjs-password-label = Īvodit paroli, kab attaiseitu PDF failu.
pdfjs-password-invalid = Napareiza parole, raugit vēļreiz.
pdfjs-password-ok-button = Labi
pdfjs-password-cancel-button = Atceļt
pdfjs-web-fonts-disabled = Šķārsteikla fonti nav aktivizāti: Navar īgult PDF fontus.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

