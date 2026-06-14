# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pagina precedenta
pdfjs-previous-button-label = Enavos
pdfjs-next-button =
    .title = Proxima pagina
pdfjs-next-button-label = Enavant
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pagina
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = da { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } da { $pagesCount })
pdfjs-zoom-out-button =
    .title = Empitschnir
pdfjs-zoom-out-button-label = Empitschnir
pdfjs-zoom-in-button =
    .title = Engrondir
pdfjs-zoom-in-button-label = Engrondir
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Midar en il modus da preschentaziun
pdfjs-presentation-mode-button-label = Modus da preschentaziun
pdfjs-open-file-button =
    .title = Avrir datoteca
pdfjs-open-file-button-label = Avrir
pdfjs-print-button =
    .title = Stampar
pdfjs-print-button-label = Stampar
pdfjs-save-button =
    .title = Memorisar
pdfjs-save-button-label = Memorisar
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Telechargiar
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Telechargiar
pdfjs-bookmark-button =
    .title = Pagina actuala (mussar l'URL da la pagina actuala)
pdfjs-bookmark-button-label = Pagina actuala

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Utensils
pdfjs-tools-button-label = Utensils
pdfjs-first-page-button =
    .title = Siglir a l'emprima pagina
pdfjs-first-page-button-label = Siglir a l'emprima pagina
pdfjs-last-page-button =
    .title = Siglir a la davosa pagina
pdfjs-last-page-button-label = Siglir a la davosa pagina
pdfjs-page-rotate-cw-button =
    .title = Rotar en direcziun da l'ura
pdfjs-page-rotate-cw-button-label = Rotar en direcziun da l'ura
pdfjs-page-rotate-ccw-button =
    .title = Rotar en direcziun cuntraria a l'ura
pdfjs-page-rotate-ccw-button-label = Rotar en direcziun cuntraria a l'ura
pdfjs-cursor-text-select-tool-button =
    .title = Activar l'utensil per selecziunar text
pdfjs-cursor-text-select-tool-button-label = Utensil per selecziunar text
pdfjs-cursor-hand-tool-button =
    .title = Activar l'utensil da maun
pdfjs-cursor-hand-tool-button-label = Utensil da maun
pdfjs-scroll-page-button =
    .title = Utilisar la defilada per pagina
pdfjs-scroll-page-button-label = Defilada per pagina
pdfjs-scroll-vertical-button =
    .title = Utilisar il defilar vertical
pdfjs-scroll-vertical-button-label = Defilar vertical
pdfjs-scroll-horizontal-button =
    .title = Utilisar il defilar orizontal
pdfjs-scroll-horizontal-button-label = Defilar orizontal
pdfjs-scroll-wrapped-button =
    .title = Utilisar il defilar en colonnas
pdfjs-scroll-wrapped-button-label = Defilar en colonnas
pdfjs-spread-none-button =
    .title = Betg parallelisar las paginas
pdfjs-spread-none-button-label = Betg parallel
pdfjs-spread-odd-button =
    .title = Parallelisar las paginas cun cumenzar cun paginas spèras
pdfjs-spread-odd-button-label = Parallel spèr
pdfjs-spread-even-button =
    .title = Parallelisar las paginas cun cumenzar cun paginas pèras
pdfjs-spread-even-button-label = Parallel pèr

## Document properties dialog

pdfjs-document-properties-button =
    .title = Caracteristicas dal document…
pdfjs-document-properties-button-label = Caracteristicas dal document…
pdfjs-document-properties-file-name = Num da la datoteca:
pdfjs-document-properties-file-size = Grondezza da la datoteca:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Titel:
pdfjs-document-properties-author = Autur:
pdfjs-document-properties-subject = Tema:
pdfjs-document-properties-keywords = Chavazzins:
pdfjs-document-properties-creation-date = Data da creaziun:
pdfjs-document-properties-modification-date = Data da modificaziun:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date } { $time }
pdfjs-document-properties-creator = Creà da:
pdfjs-document-properties-producer = Creà il PDF cun:
pdfjs-document-properties-version = Versiun da PDF:
pdfjs-document-properties-page-count = Dumber da paginas:
pdfjs-document-properties-page-size = Grondezza da la pagina:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = vertical
pdfjs-document-properties-page-size-orientation-landscape = orizontal
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
pdfjs-document-properties-linearized-yes = Gea
pdfjs-document-properties-linearized-no = Na
pdfjs-document-properties-close-button = Serrar

## Print

pdfjs-print-progress-message = Preparar il document per stampar…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Interrumper
pdfjs-printing-not-supported = Attenziun: Il stampar na funcziunescha anc betg dal tut en quest navigatur.
pdfjs-printing-not-ready = Attenziun: Il PDF n'è betg chargià cumplettamain per stampar.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Activar/deactivar la trav laterala
pdfjs-toggle-sidebar-notification-button =
    .title = Activar/deactivar la trav laterala (il document cuntegna structura dal document/agiuntas/nivels)
pdfjs-toggle-sidebar-button-label = Activar/deactivar la trav laterala
pdfjs-document-outline-button =
    .title = Mussar la structura dal document (cliccar duas giadas per extender/cumprimer tut ils elements)
pdfjs-document-outline-button-label = Structura dal document
pdfjs-attachments-button =
    .title = Mussar agiuntas
pdfjs-attachments-button-label = Agiuntas
pdfjs-layers-button =
    .title = Mussar ils nivels (cliccar dubel per restaurar il stadi da standard da tut ils nivels)
pdfjs-layers-button-label = Nivels
pdfjs-thumbs-button =
    .title = Mussar las miniaturas
pdfjs-thumbs-button-label = Miniaturas
pdfjs-current-outline-item-button =
    .title = Tschertgar l'element da structura actual
pdfjs-current-outline-item-button-label = Element da structura actual
pdfjs-findbar-button =
    .title = Tschertgar en il document
pdfjs-findbar-button-label = Tschertgar
pdfjs-additional-layers = Nivels supplementars

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pagina { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura da la pagina { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Tschertgar
    .placeholder = Tschertgar en il document…
pdfjs-find-previous-button =
    .title = Tschertgar la posiziun precedenta da l'expressiun
pdfjs-find-previous-button-label = Enavos
pdfjs-find-next-button =
    .title = Tschertgar la proxima posiziun da l'expressiun
pdfjs-find-next-button-label = Enavant
pdfjs-find-highlight-checkbox = Relevar tuts
pdfjs-find-match-case-checkbox-label = Resguardar maiusclas/minusclas
pdfjs-find-match-diacritics-checkbox-label = Resguardar ils segns diacritics
pdfjs-find-entire-word-checkbox-label = Pleds entirs
pdfjs-find-reached-top = Il cumenzament dal document è cuntanschì, la tschertga cuntinuescha a la fin dal document
pdfjs-find-reached-bottom = La fin dal document è cuntanschì, la tschertga cuntinuescha al cumenzament dal document
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } dad { $total } correspundenza
       *[other] { $current } da { $total } correspundenzas
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Dapli che { $limit } correspundenza
       *[other] Dapli che { $limit } correspundenzas
    }
pdfjs-find-not-found = Impussibel da chattar l'expressiun

## Predefined zoom values

pdfjs-page-scale-width = Ladezza da la pagina
pdfjs-page-scale-fit = Entira pagina
pdfjs-page-scale-auto = Zoom automatic
pdfjs-page-scale-actual = Grondezza actuala
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Pagina { $page }

## Loading indicator messages

pdfjs-loading-error = Ina errur è cumparida cun chargiar il PDF.
pdfjs-invalid-file-error = Datoteca PDF nunvalida u donnegiada.
pdfjs-missing-file-error = Datoteca PDF manconta.
pdfjs-unexpected-response-error = Resposta nunspetgada dal server.
pdfjs-rendering-error = Ina errur è cumparida cun visualisar questa pagina.

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
    .alt = [Annotaziun da { $type }]

## Password

pdfjs-password-label = Endatescha il pled-clav per avrir questa datoteca da PDF.
pdfjs-password-invalid = Pled-clav nunvalid. Emprova anc ina giada.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Interrumper
pdfjs-web-fonts-disabled = Scrittiras dal web èn deactivadas: impussibel dad utilisar las scrittiras integradas en il PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Text
pdfjs-editor-free-text-button-label = Text
pdfjs-editor-ink-button =
    .title = Dissegnar
pdfjs-editor-ink-button-label = Dissegnar
pdfjs-editor-stamp-button =
    .title = Agiuntar u modifitgar maletgs
pdfjs-editor-stamp-button-label = Agiuntar u modifitgar maletgs
pdfjs-editor-highlight-button =
    .title = Marcar
pdfjs-editor-highlight-button-label = Marcar
pdfjs-highlight-floating-button =
    .title = Relevar
pdfjs-highlight-floating-button1 =
    .title = Marcar
    .aria-label = Marcar
pdfjs-highlight-floating-button-label = Marcar

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Allontanar il dissegn
pdfjs-editor-remove-freetext-button =
    .title = Allontanar il text
pdfjs-editor-remove-stamp-button =
    .title = Allontanar la grafica
pdfjs-editor-remove-highlight-button =
    .title = Allontanar l'emfasa

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Colur
pdfjs-editor-free-text-size-input = Grondezza
pdfjs-editor-ink-color-input = Colur
pdfjs-editor-ink-thickness-input = Grossezza
pdfjs-editor-ink-opacity-input = Opacitad
pdfjs-editor-stamp-add-image-button =
    .title = Agiuntar in maletg
pdfjs-editor-stamp-add-image-button-label = Agiuntar in maletg
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Grossezza
pdfjs-editor-free-highlight-thickness-title =
    .title = Midar la grossezza cun relevar elements betg textuals
pdfjs-free-text =
    .aria-label = Editur da text
pdfjs-free-text-default-content = Cumenzar a tippar…
pdfjs-ink =
    .aria-label = Editur dissegn
pdfjs-ink-canvas =
    .aria-label = Maletg creà da l'utilisader

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Text alternativ
pdfjs-editor-alt-text-edit-button-label = Modifitgar il text alternativ
pdfjs-editor-alt-text-dialog-label = Tscherner ina opziun
pdfjs-editor-alt-text-dialog-description = Il text alternativ (alt text) gida en cas che persunas na vesan betg il maletg u sch'i na reussescha betg d'al chargiar.
pdfjs-editor-alt-text-add-description-label = Agiuntar ina descripziun
pdfjs-editor-alt-text-add-description-description = Scriva idealmain 1-2 frasas che descrivan l'object, la situaziun u las acziuns.
pdfjs-editor-alt-text-mark-decorative-label = Marcar sco decorativ
pdfjs-editor-alt-text-mark-decorative-description = Quai vegn duvrà per maletgs ornamentals, sco urs u filigranas.
pdfjs-editor-alt-text-cancel-button = Interrumper
pdfjs-editor-alt-text-save-button = Memorisar
pdfjs-editor-alt-text-decorative-tooltip = Marcà sco decorativ
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Per exempel: «In um giuven sesa a maisa per mangiar in past»

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Chantun sura a sanestra — redimensiunar
pdfjs-editor-resizer-label-top-middle = Sura amez — redimensiunar
pdfjs-editor-resizer-label-top-right = Chantun sura a dretga — redimensiunar
pdfjs-editor-resizer-label-middle-right = Da vart dretga amez — redimensiunar
pdfjs-editor-resizer-label-bottom-right = Chantun sut a dretga — redimensiunar
pdfjs-editor-resizer-label-bottom-middle = Sutvart amez — redimensiunar
pdfjs-editor-resizer-label-bottom-left = Chantun sut a sanestra — redimensiunar
pdfjs-editor-resizer-label-middle-left = Vart sanestra amez — redimensiunar

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Colur per l'emfasa
pdfjs-editor-colorpicker-button =
    .title = Midar la colur
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Colurs disponiblas
pdfjs-editor-colorpicker-yellow =
    .title = Mellen
pdfjs-editor-colorpicker-green =
    .title = Verd
pdfjs-editor-colorpicker-blue =
    .title = Blau
pdfjs-editor-colorpicker-pink =
    .title = Rosa
pdfjs-editor-colorpicker-red =
    .title = Cotschen

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Mussar tut
pdfjs-editor-highlight-show-all-button =
    .title = Mussar tut
