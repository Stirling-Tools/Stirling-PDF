# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pagina previe
pdfjs-previous-button-label = Previe
pdfjs-next-button =
    .title = Pagina sequente
pdfjs-next-button-label = Sequente
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pagina
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = de { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } de { $pagesCount })
pdfjs-zoom-out-button =
    .title = Distantiar
pdfjs-zoom-out-button-label = Distantiar
pdfjs-zoom-in-button =
    .title = Approximar
pdfjs-zoom-in-button-label = Approximar
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Excambiar a modo presentation
pdfjs-presentation-mode-button-label = Modo presentation
pdfjs-open-file-button =
    .title = Aperir le file
pdfjs-open-file-button-label = Aperir
pdfjs-print-button =
    .title = Imprimer
pdfjs-print-button-label = Imprimer
pdfjs-save-button =
    .title = Salvar
pdfjs-save-button-label = Salvar
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Discargar
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Discargar
pdfjs-bookmark-button =
    .title = Pagina actual (vide le URL del pagina actual)
pdfjs-bookmark-button-label = Pagina actual

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Instrumentos
pdfjs-tools-button-label = Instrumentos
pdfjs-first-page-button =
    .title = Ir al prime pagina
pdfjs-first-page-button-label = Ir al prime pagina
pdfjs-last-page-button =
    .title = Ir al ultime pagina
pdfjs-last-page-button-label = Ir al ultime pagina
pdfjs-page-rotate-cw-button =
    .title = Rotar in senso horari
pdfjs-page-rotate-cw-button-label = Rotar in senso horari
pdfjs-page-rotate-ccw-button =
    .title = Rotar in senso antihorari
pdfjs-page-rotate-ccw-button-label = Rotar in senso antihorari
pdfjs-cursor-text-select-tool-button =
    .title = Activar le instrumento de selection de texto
pdfjs-cursor-text-select-tool-button-label = Instrumento de selection de texto
pdfjs-cursor-hand-tool-button =
    .title = Activar le instrumento mano
pdfjs-cursor-hand-tool-button-label = Instrumento mano
pdfjs-scroll-page-button =
    .title = Usar rolamento de pagina
pdfjs-scroll-page-button-label = Rolamento de pagina
pdfjs-scroll-vertical-button =
    .title = Usar rolamento vertical
pdfjs-scroll-vertical-button-label = Rolamento vertical
pdfjs-scroll-horizontal-button =
    .title = Usar rolamento horizontal
pdfjs-scroll-horizontal-button-label = Rolamento horizontal
pdfjs-scroll-wrapped-button =
    .title = Usar rolamento incapsulate
pdfjs-scroll-wrapped-button-label = Rolamento incapsulate
pdfjs-spread-none-button =
    .title = Non junger paginas dual
pdfjs-spread-none-button-label = Sin paginas dual
pdfjs-spread-odd-button =
    .title = Junger paginas dual a partir de paginas con numeros impar
pdfjs-spread-odd-button-label = Paginas dual impar
pdfjs-spread-even-button =
    .title = Junger paginas dual a partir de paginas con numeros par
pdfjs-spread-even-button-label = Paginas dual par

## Document properties dialog

pdfjs-document-properties-button =
    .title = Proprietates del documento…
pdfjs-document-properties-button-label = Proprietates del documento…
pdfjs-document-properties-file-name = Nomine del file:
pdfjs-document-properties-file-size = Dimension de file:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Titulo:
pdfjs-document-properties-author = Autor:
pdfjs-document-properties-subject = Subjecto:
pdfjs-document-properties-keywords = Parolas clave:
pdfjs-document-properties-creation-date = Data de creation:
pdfjs-document-properties-modification-date = Data de modification:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Creator:
pdfjs-document-properties-producer = Productor PDF:
pdfjs-document-properties-version = Version PDF:
pdfjs-document-properties-page-count = Numero de paginas:
pdfjs-document-properties-page-size = Dimension del pagina:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = vertical
pdfjs-document-properties-page-size-orientation-landscape = horizontal
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Littera
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
pdfjs-document-properties-linearized = Vista web rapide:
pdfjs-document-properties-linearized-yes = Si
pdfjs-document-properties-linearized-no = No
pdfjs-document-properties-close-button = Clauder

## Print

pdfjs-print-progress-message = Preparation del documento pro le impression…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Cancellar
pdfjs-printing-not-supported = Attention : le impression non es totalmente supportate per ce navigator.
pdfjs-printing-not-ready = Attention: le file PDF non es integremente cargate pro lo poter imprimer.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Monstrar/celar le barra lateral
pdfjs-toggle-sidebar-notification-button =
    .title = Monstrar/celar le barra lateral (le documento contine structura/attachamentos/stratos)
pdfjs-toggle-sidebar-button-label = Monstrar/celar le barra lateral
pdfjs-document-outline-button =
    .title = Monstrar le schema del documento (clic duple pro expander/contraher tote le elementos)
pdfjs-document-outline-button-label = Schema del documento
pdfjs-attachments-button =
    .title = Monstrar le annexos
pdfjs-attachments-button-label = Annexos
pdfjs-layers-button =
    .title = Monstrar stratos (clicca duple pro remontar tote le stratos al stato predefinite)
pdfjs-layers-button-label = Stratos
pdfjs-thumbs-button =
    .title = Monstrar le vignettes
pdfjs-thumbs-button-label = Vignettes
pdfjs-current-outline-item-button =
    .title = Trovar le elemento de structura actual
pdfjs-current-outline-item-button-label = Elemento de structura actual
pdfjs-findbar-button =
    .title = Cercar in le documento
pdfjs-findbar-button-label = Cercar
pdfjs-additional-layers = Altere stratos

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pagina { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Vignette del pagina { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Cercar
    .placeholder = Cercar in le documento…
pdfjs-find-previous-button =
    .title = Trovar le previe occurrentia del phrase
pdfjs-find-previous-button-label = Previe
pdfjs-find-next-button =
    .title = Trovar le successive occurrentia del phrase
pdfjs-find-next-button-label = Sequente
pdfjs-find-highlight-checkbox = Evidentiar toto
pdfjs-find-match-case-checkbox-label = Distinguer majusculas/minusculas
pdfjs-find-match-diacritics-checkbox-label = Differentiar diacriticos
pdfjs-find-entire-word-checkbox-label = Parolas integre
pdfjs-find-reached-top = Initio del documento attingite, continuation ab fin
pdfjs-find-reached-bottom = Fin del documento attingite, continuation ab initio
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } de { $total } correspondentia
       *[other] { $current } de { $total } correspondentias
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Plus de { $limit } correspondentia
       *[other] Plus de { $limit } correspondentias
    }
pdfjs-find-not-found = Phrase non trovate

## Predefined zoom values

pdfjs-page-scale-width = Plen largor del pagina
pdfjs-page-scale-fit = Pagina integre
pdfjs-page-scale-auto = Zoom automatic
pdfjs-page-scale-actual = Dimension real
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Pagina { $page }

## Loading indicator messages

pdfjs-loading-error = Un error occurreva durante que on cargava le file PDF.
pdfjs-invalid-file-error = File PDF corrumpite o non valide.
pdfjs-missing-file-error = File PDF mancante.
pdfjs-unexpected-response-error = Responsa del servitor inexpectate.
pdfjs-rendering-error = Un error occurreva durante que on processava le pagina.

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
    .alt = [{ $type } Annotation]

## Password

pdfjs-password-label = Insere le contrasigno pro aperir iste file PDF.
pdfjs-password-invalid = Contrasigno invalide. Per favor retenta.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Cancellar
pdfjs-web-fonts-disabled = Le typos de litteras web es disactivate: impossibile usar le typos de litteras PDF incorporate.

## Editing

pdfjs-editor-free-text-button =
    .title = Texto
pdfjs-editor-free-text-button-label = Texto
pdfjs-editor-ink-button =
    .title = Designar
pdfjs-editor-ink-button-label = Designar
pdfjs-editor-stamp-button =
    .title = Adder o rediger imagines
pdfjs-editor-stamp-button-label = Adder o rediger imagines
pdfjs-editor-highlight-button =
    .title = Evidentia
pdfjs-editor-highlight-button-label = Evidentia
pdfjs-highlight-floating-button1 =
    .title = Evidentiar
    .aria-label = Evidentiar
pdfjs-highlight-floating-button-label = Evidentiar

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Remover le designo
pdfjs-editor-remove-freetext-button =
    .title = Remover texto
pdfjs-editor-remove-stamp-button =
    .title = Remover imagine
pdfjs-editor-remove-highlight-button =
    .title = Remover evidentia

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Color
pdfjs-editor-free-text-size-input = Dimension
pdfjs-editor-ink-color-input = Color
pdfjs-editor-ink-thickness-input = Spissor
pdfjs-editor-ink-opacity-input = Opacitate
pdfjs-editor-stamp-add-image-button =
    .title = Adder imagine
pdfjs-editor-stamp-add-image-button-label = Adder imagine
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Spissor
pdfjs-editor-free-highlight-thickness-title =
    .title = Cambiar spissor evidentiante elementos differente de texto
pdfjs-free-text =
    .aria-label = Editor de texto
pdfjs-free-text-default-content = Comenciar a scriber…
pdfjs-ink =
    .aria-label = Editor de designos
pdfjs-ink-canvas =
    .aria-label = Imagine create per le usator

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Texto alternative
pdfjs-editor-alt-text-edit-button-label = Rediger texto alternative
pdfjs-editor-alt-text-dialog-label = Elige un option
pdfjs-editor-alt-text-dialog-description = Le texto alternative (alt text) adjuta quando le personas non pote vider le imagine o quando illo non carga.
pdfjs-editor-alt-text-add-description-label = Adder un description
pdfjs-editor-alt-text-add-description-description = Mira a 1-2 phrases que describe le subjecto, parametro, o actiones.
pdfjs-editor-alt-text-mark-decorative-label = Marcar como decorative
pdfjs-editor-alt-text-mark-decorative-description = Isto es usate pro imagines ornamental, como bordaturas o filigranas.
pdfjs-editor-alt-text-cancel-button = Cancellar
pdfjs-editor-alt-text-save-button = Salvar
pdfjs-editor-alt-text-decorative-tooltip = Marcate como decorative
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Per exemplo, “Un juvene sede a un tabula pro mangiar un repasto”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Angulo superior sinistre — redimensionar
pdfjs-editor-resizer-label-top-middle = Medio superior — redimensionar
pdfjs-editor-resizer-label-top-right = Angulo superior dextre — redimensionar
pdfjs-editor-resizer-label-middle-right = Medio dextre — redimensionar
pdfjs-editor-resizer-label-bottom-right = Angulo inferior dextre — redimensionar
pdfjs-editor-resizer-label-bottom-middle = Medio inferior — redimensionar
pdfjs-editor-resizer-label-bottom-left = Angulo inferior sinistre — redimensionar
pdfjs-editor-resizer-label-middle-left = Medio sinistre — redimensionar

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Color pro evidentiar
pdfjs-editor-colorpicker-button =
    .title = Cambiar color
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Electiones del color
pdfjs-editor-colorpicker-yellow =
    .title = Jalne
pdfjs-editor-colorpicker-green =
    .title = Verde
pdfjs-editor-colorpicker-blue =
    .title = Blau
pdfjs-editor-colorpicker-pink =
    .title = Rosate
pdfjs-editor-colorpicker-red =
    .title = Rubie

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Monstrar toto
pdfjs-editor-highlight-show-all-button =
    .title = Monstrar toto
