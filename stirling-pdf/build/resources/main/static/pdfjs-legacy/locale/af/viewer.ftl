# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Vorige bladsy
pdfjs-previous-button-label = Vorige
pdfjs-next-button =
    .title = Volgende bladsy
pdfjs-next-button-label = Volgende
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Bladsy
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = van { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } van { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zoem uit
pdfjs-zoom-out-button-label = Zoem uit
pdfjs-zoom-in-button =
    .title = Zoem in
pdfjs-zoom-in-button-label = Zoem in
pdfjs-zoom-select =
    .title = Zoem
pdfjs-presentation-mode-button =
    .title = Wissel na voorleggingsmodus
pdfjs-presentation-mode-button-label = Voorleggingsmodus
pdfjs-open-file-button =
    .title = Open lêer
pdfjs-open-file-button-label = Open
pdfjs-print-button =
    .title = Druk
pdfjs-print-button-label = Druk

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Nutsgoed
pdfjs-tools-button-label = Nutsgoed
pdfjs-first-page-button =
    .title = Gaan na eerste bladsy
pdfjs-first-page-button-label = Gaan na eerste bladsy
pdfjs-last-page-button =
    .title = Gaan na laaste bladsy
pdfjs-last-page-button-label = Gaan na laaste bladsy
pdfjs-page-rotate-cw-button =
    .title = Roteer kloksgewys
pdfjs-page-rotate-cw-button-label = Roteer kloksgewys
pdfjs-page-rotate-ccw-button =
    .title = Roteer anti-kloksgewys
pdfjs-page-rotate-ccw-button-label = Roteer anti-kloksgewys
pdfjs-cursor-text-select-tool-button =
    .title = Aktiveer gereedskap om teks te merk
pdfjs-cursor-text-select-tool-button-label = Teksmerkgereedskap
pdfjs-cursor-hand-tool-button =
    .title = Aktiveer handjie
pdfjs-cursor-hand-tool-button-label = Handjie

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumenteienskappe…
pdfjs-document-properties-button-label = Dokumenteienskappe…
pdfjs-document-properties-file-name = Lêernaam:
pdfjs-document-properties-file-size = Lêergrootte:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } kG ({ $size_b } grepe)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MG ({ $size_b } grepe)
pdfjs-document-properties-title = Titel:
pdfjs-document-properties-author = Outeur:
pdfjs-document-properties-subject = Onderwerp:
pdfjs-document-properties-keywords = Sleutelwoorde:
pdfjs-document-properties-creation-date = Skeppingsdatum:
pdfjs-document-properties-modification-date = Wysigingsdatum:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Skepper:
pdfjs-document-properties-producer = PDF-vervaardiger:
pdfjs-document-properties-version = PDF-weergawe:
pdfjs-document-properties-page-count = Aantal bladsye:

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page


##

pdfjs-document-properties-close-button = Sluit

## Print

pdfjs-print-progress-message = Berei tans dokument voor om te druk…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Kanselleer
pdfjs-printing-not-supported = Waarskuwing: Dié blaaier ondersteun nie drukwerk ten volle nie.
pdfjs-printing-not-ready = Waarskuwing: Die PDF is nog nie volledig gelaai vir drukwerk nie.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Sypaneel aan/af
pdfjs-toggle-sidebar-button-label = Sypaneel aan/af
pdfjs-document-outline-button =
    .title = Wys dokumentskema (dubbelklik om alle items oop/toe te vou)
pdfjs-document-outline-button-label = Dokumentoorsig
pdfjs-attachments-button =
    .title = Wys aanhegsels
pdfjs-attachments-button-label = Aanhegsels
pdfjs-thumbs-button =
    .title = Wys duimnaels
pdfjs-thumbs-button-label = Duimnaels
pdfjs-findbar-button =
    .title = Soek in dokument
pdfjs-findbar-button-label = Vind

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Bladsy { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Duimnael van bladsy { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Vind
    .placeholder = Soek in dokument…
pdfjs-find-previous-button =
    .title = Vind die vorige voorkoms van die frase
pdfjs-find-previous-button-label = Vorige
pdfjs-find-next-button =
    .title = Vind die volgende voorkoms van die frase
pdfjs-find-next-button-label = Volgende
pdfjs-find-highlight-checkbox = Verlig almal
pdfjs-find-match-case-checkbox-label = Kassensitief
pdfjs-find-reached-top = Bokant van dokument is bereik; gaan voort van onder af
pdfjs-find-reached-bottom = Einde van dokument is bereik; gaan voort van bo af
pdfjs-find-not-found = Frase nie gevind nie

## Predefined zoom values

pdfjs-page-scale-width = Bladsywydte
pdfjs-page-scale-fit = Pas bladsy
pdfjs-page-scale-auto = Outomatiese zoem
pdfjs-page-scale-actual = Werklike grootte
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = 'n Fout het voorgekom met die laai van die PDF.
pdfjs-invalid-file-error = Ongeldige of korrupte PDF-lêer.
pdfjs-missing-file-error = PDF-lêer is weg.
pdfjs-unexpected-response-error = Onverwagse antwoord van bediener.
pdfjs-rendering-error = 'n Fout het voorgekom toe die bladsy weergegee is.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type }-annotasie]

## Password

pdfjs-password-label = Gee die wagwoord om dié PDF-lêer mee te open.
pdfjs-password-invalid = Ongeldige wagwoord. Probeer gerus weer.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Kanselleer
pdfjs-web-fonts-disabled = Webfonte is gedeaktiveer: kan nie PDF-fonte wat ingebed is, gebruik nie.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

