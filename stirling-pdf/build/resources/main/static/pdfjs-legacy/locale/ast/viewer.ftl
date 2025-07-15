# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Páxina anterior
pdfjs-previous-button-label = Anterior
pdfjs-next-button =
    .title = Páxina siguiente
pdfjs-next-button-label = Siguiente
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Páxina
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = de { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } de { $pagesCount })
pdfjs-zoom-out-button =
    .title = Alloñar
pdfjs-zoom-out-button-label = Alloña
pdfjs-zoom-in-button =
    .title = Averar
pdfjs-zoom-in-button-label = Avera
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Cambiar al mou de presentación
pdfjs-presentation-mode-button-label = Mou de presentación
pdfjs-open-file-button-label = Abrir
pdfjs-print-button =
    .title = Imprentar
pdfjs-print-button-label = Imprentar

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Ferramientes
pdfjs-tools-button-label = Ferramientes
pdfjs-first-page-button-label = Dir a la primer páxina
pdfjs-last-page-button-label = Dir a la última páxina
pdfjs-page-rotate-cw-button =
    .title = Voltia a la derecha
pdfjs-page-rotate-cw-button-label = Voltiar a la derecha
pdfjs-page-rotate-ccw-button =
    .title = Voltia a la esquierda
pdfjs-page-rotate-ccw-button-label = Voltiar a la esquierda
pdfjs-cursor-text-select-tool-button =
    .title = Activa la ferramienta d'esbilla de testu
pdfjs-cursor-text-select-tool-button-label = Ferramienta d'esbilla de testu
pdfjs-cursor-hand-tool-button =
    .title = Activa la ferramienta de mano
pdfjs-cursor-hand-tool-button-label = Ferramienta de mano
pdfjs-scroll-vertical-button =
    .title = Usa'l desplazamientu vertical
pdfjs-scroll-vertical-button-label = Desplazamientu vertical
pdfjs-scroll-horizontal-button =
    .title = Usa'l desplazamientu horizontal
pdfjs-scroll-horizontal-button-label = Desplazamientu horizontal
pdfjs-scroll-wrapped-button =
    .title = Usa'l desplazamientu continuu
pdfjs-scroll-wrapped-button-label = Desplazamientu continuu
pdfjs-spread-none-button-label = Fueyes individuales
pdfjs-spread-odd-button-label = Fueyes pares
pdfjs-spread-even-button-label = Fueyes impares

## Document properties dialog

pdfjs-document-properties-button =
    .title = Propiedaes del documentu…
pdfjs-document-properties-button-label = Propiedaes del documentu…
pdfjs-document-properties-file-name = Nome del ficheru:
pdfjs-document-properties-file-size = Tamañu del ficheru:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Títulu:
pdfjs-document-properties-keywords = Pallabres clave:
pdfjs-document-properties-creation-date = Data de creación:
pdfjs-document-properties-modification-date = Data de modificación:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-producer = Productor del PDF:
pdfjs-document-properties-version = Versión del PDF:
pdfjs-document-properties-page-count = Númberu de páxines:
pdfjs-document-properties-page-size = Tamañu de páxina:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = vertical
pdfjs-document-properties-page-size-orientation-landscape = horizontal
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4

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
pdfjs-document-properties-linearized = Vista web rápida:
pdfjs-document-properties-linearized-yes = Sí
pdfjs-document-properties-linearized-no = Non
pdfjs-document-properties-close-button = Zarrar

## Print

# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Encaboxar

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Alternar la barra llateral
pdfjs-attachments-button =
    .title = Amosar los axuntos
pdfjs-attachments-button-label = Axuntos
pdfjs-layers-button-label = Capes
pdfjs-thumbs-button =
    .title = Amosar les miniatures
pdfjs-thumbs-button-label = Miniatures
pdfjs-findbar-button-label = Atopar
pdfjs-additional-layers = Capes adicionales

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Páxina { $page }

## Find panel button title and messages

pdfjs-find-previous-button-label = Anterior
pdfjs-find-next-button-label = Siguiente
pdfjs-find-entire-word-checkbox-label = Pallabres completes
pdfjs-find-reached-top = Algamóse'l comienzu de la páxina, síguese dende abaxo
pdfjs-find-reached-bottom = Algamóse la fin del documentu, síguese dende arriba

## Predefined zoom values

pdfjs-page-scale-auto = Zoom automáticu
pdfjs-page-scale-actual = Tamañu real
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Páxina { $page }

## Loading indicator messages

pdfjs-loading-error = Asocedió un fallu mentanto se cargaba'l PDF.

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date }, { $time }

## Password

pdfjs-password-ok-button = Aceptar
pdfjs-password-cancel-button = Encaboxar

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

