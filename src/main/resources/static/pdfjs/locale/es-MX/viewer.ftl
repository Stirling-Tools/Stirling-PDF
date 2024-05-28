# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Página anterior
pdfjs-previous-button-label = Anterior
pdfjs-next-button =
    .title = Página siguiente
pdfjs-next-button-label = Siguiente
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Página
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = de { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } de { $pagesCount })
pdfjs-zoom-out-button =
    .title = Reducir
pdfjs-zoom-out-button-label = Reducir
pdfjs-zoom-in-button =
    .title = Aumentar
pdfjs-zoom-in-button-label = Aumentar
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Cambiar al modo presentación
pdfjs-presentation-mode-button-label = Modo presentación
pdfjs-open-file-button =
    .title = Abrir archivo
pdfjs-open-file-button-label = Abrir
pdfjs-print-button =
    .title = Imprimir
pdfjs-print-button-label = Imprimir
pdfjs-save-button =
    .title = Guardar
pdfjs-save-button-label = Guardar
pdfjs-bookmark-button =
    .title = Página actual (Ver URL de la página actual)
pdfjs-bookmark-button-label = Página actual
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Abrir en la aplicación
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Abrir en la aplicación

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Herramientas
pdfjs-tools-button-label = Herramientas
pdfjs-first-page-button =
    .title = Ir a la primera página
pdfjs-first-page-button-label = Ir a la primera página
pdfjs-last-page-button =
    .title = Ir a la última página
pdfjs-last-page-button-label = Ir a la última página
pdfjs-page-rotate-cw-button =
    .title = Girar a la derecha
pdfjs-page-rotate-cw-button-label = Girar a la derecha
pdfjs-page-rotate-ccw-button =
    .title = Girar a la izquierda
pdfjs-page-rotate-ccw-button-label = Girar a la izquierda
pdfjs-cursor-text-select-tool-button =
    .title = Activar la herramienta de selección de texto
pdfjs-cursor-text-select-tool-button-label = Herramienta de selección de texto
pdfjs-cursor-hand-tool-button =
    .title = Activar la herramienta de mano
pdfjs-cursor-hand-tool-button-label = Herramienta de mano
pdfjs-scroll-page-button =
    .title = Usar desplazamiento de página
pdfjs-scroll-page-button-label = Desplazamiento de página
pdfjs-scroll-vertical-button =
    .title = Usar desplazamiento vertical
pdfjs-scroll-vertical-button-label = Desplazamiento vertical
pdfjs-scroll-horizontal-button =
    .title = Usar desplazamiento horizontal
pdfjs-scroll-horizontal-button-label = Desplazamiento horizontal
pdfjs-scroll-wrapped-button =
    .title = Usar desplazamiento encapsulado
pdfjs-scroll-wrapped-button-label = Desplazamiento encapsulado
pdfjs-spread-none-button =
    .title = No unir páginas separadas
pdfjs-spread-none-button-label = Vista de una página
pdfjs-spread-odd-button =
    .title = Unir las páginas partiendo con una de número impar
pdfjs-spread-odd-button-label = Vista de libro impar
pdfjs-spread-even-button =
    .title = Juntar las páginas partiendo con una de número par
pdfjs-spread-even-button-label = Vista de libro par

## Document properties dialog

pdfjs-document-properties-button =
    .title = Propiedades del documento…
pdfjs-document-properties-button-label = Propiedades del documento…
pdfjs-document-properties-file-name = Nombre del archivo:
pdfjs-document-properties-file-size = Tamaño del archivo:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Título:
pdfjs-document-properties-author = Autor:
pdfjs-document-properties-subject = Asunto:
pdfjs-document-properties-keywords = Palabras claves:
pdfjs-document-properties-creation-date = Fecha de creación:
pdfjs-document-properties-modification-date = Fecha de modificación:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Creador:
pdfjs-document-properties-producer = Productor PDF:
pdfjs-document-properties-version = Versión PDF:
pdfjs-document-properties-page-count = Número de páginas:
pdfjs-document-properties-page-size = Tamaño de la página:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = vertical
pdfjs-document-properties-page-size-orientation-landscape = horizontal
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Carta
pdfjs-document-properties-page-size-name-legal = Oficio

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
pdfjs-document-properties-linearized = Vista rápida de la web:
pdfjs-document-properties-linearized-yes = Sí
pdfjs-document-properties-linearized-no = No
pdfjs-document-properties-close-button = Cerrar

## Print

pdfjs-print-progress-message = Preparando documento para impresión…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Cancelar
pdfjs-printing-not-supported = Advertencia: La impresión no esta completamente soportada por este navegador.
pdfjs-printing-not-ready = Advertencia: El PDF no cargo completamente para impresión.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Cambiar barra lateral
pdfjs-toggle-sidebar-notification-button =
    .title = Alternar barra lateral (el documento contiene esquemas/adjuntos/capas)
pdfjs-toggle-sidebar-button-label = Cambiar barra lateral
pdfjs-document-outline-button =
    .title = Mostrar esquema del documento (doble clic para expandir/contraer todos los elementos)
pdfjs-document-outline-button-label = Esquema del documento
pdfjs-attachments-button =
    .title = Mostrar adjuntos
pdfjs-attachments-button-label = Adjuntos
pdfjs-layers-button =
    .title = Mostrar capas (doble clic para restablecer todas las capas al estado predeterminado)
pdfjs-layers-button-label = Capas
pdfjs-thumbs-button =
    .title = Mostrar miniaturas
pdfjs-thumbs-button-label = Miniaturas
pdfjs-current-outline-item-button =
    .title = Buscar elemento de esquema actual
pdfjs-current-outline-item-button-label = Elemento de esquema actual
pdfjs-findbar-button =
    .title = Buscar en el documento
pdfjs-findbar-button-label = Buscar
pdfjs-additional-layers = Capas adicionales

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Página { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura de la página { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Buscar
    .placeholder = Buscar en el documento…
pdfjs-find-previous-button =
    .title = Ir a la anterior frase encontrada
pdfjs-find-previous-button-label = Anterior
pdfjs-find-next-button =
    .title = Ir a la siguiente frase encontrada
pdfjs-find-next-button-label = Siguiente
pdfjs-find-highlight-checkbox = Resaltar todo
pdfjs-find-match-case-checkbox-label = Coincidir con mayúsculas y minúsculas
pdfjs-find-match-diacritics-checkbox-label = Coincidir diacríticos
pdfjs-find-entire-word-checkbox-label = Palabras completas
pdfjs-find-reached-top = Se alcanzó el inicio del documento, se buscará al final
pdfjs-find-reached-bottom = Se alcanzó el final del documento, se buscará al inicio
pdfjs-find-not-found = No se encontró la frase

## Predefined zoom values

pdfjs-page-scale-width = Ancho de página
pdfjs-page-scale-fit = Ajustar página
pdfjs-page-scale-auto = Zoom automático
pdfjs-page-scale-actual = Tamaño real
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Página { $page }

## Loading indicator messages

pdfjs-loading-error = Un error ocurrió al cargar el PDF.
pdfjs-invalid-file-error = Archivo PDF invalido o dañado.
pdfjs-missing-file-error = Archivo PDF no encontrado.
pdfjs-unexpected-response-error = Respuesta inesperada del servidor.
pdfjs-rendering-error = Un error ocurrió al renderizar la página.

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
    .alt = [{ $type } anotación]

## Password

pdfjs-password-label = Ingresa la contraseña para abrir este archivo PDF.
pdfjs-password-invalid = Contraseña inválida. Por favor intenta de nuevo.
pdfjs-password-ok-button = Aceptar
pdfjs-password-cancel-button = Cancelar
pdfjs-web-fonts-disabled = Las fuentes web están desactivadas: es imposible usar las fuentes PDF embebidas.

## Editing

pdfjs-editor-free-text-button =
    .title = Texto
pdfjs-editor-free-text-button-label = Texto
pdfjs-editor-ink-button =
    .title = Dibujar
pdfjs-editor-ink-button-label = Dibujar
# Editor Parameters
pdfjs-editor-free-text-color-input = Color
pdfjs-editor-free-text-size-input = Tamaño
pdfjs-editor-ink-color-input = Color
pdfjs-editor-ink-thickness-input = Grossor
pdfjs-editor-ink-opacity-input = Opacidad
pdfjs-free-text =
    .aria-label = Editor de texto
pdfjs-free-text-default-content = Empieza a escribir…
pdfjs-ink =
    .aria-label = Editor de dibujo
pdfjs-ink-canvas =
    .aria-label = Imagen creada por el usuario

## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

