# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pagina precedenta
pdfjs-previous-button-label = Precedent
pdfjs-next-button =
    .title = Pagina seguenta
pdfjs-next-button-label = Seguent
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pagina
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = sus { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } de { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zoom arrièr
pdfjs-zoom-out-button-label = Zoom arrièr
pdfjs-zoom-in-button =
    .title = Zoom avant
pdfjs-zoom-in-button-label = Zoom avant
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Bascular en mòde presentacion
pdfjs-presentation-mode-button-label = Mòde Presentacion
pdfjs-open-file-button =
    .title = Dobrir lo fichièr
pdfjs-open-file-button-label = Dobrir
pdfjs-print-button =
    .title = Imprimir
pdfjs-print-button-label = Imprimir
pdfjs-save-button =
    .title = Enregistrar
pdfjs-save-button-label = Enregistrar
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Telecargar
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Telecargar
pdfjs-bookmark-button =
    .title = Pagina actuala (mostrar l’adreça de la pagina actuala)
pdfjs-bookmark-button-label = Pagina actuala
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Dobrir amb l’aplicacion
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Dobrir amb l’aplicacion

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Aisinas
pdfjs-tools-button-label = Aisinas
pdfjs-first-page-button =
    .title = Anar a la primièra pagina
pdfjs-first-page-button-label = Anar a la primièra pagina
pdfjs-last-page-button =
    .title = Anar a la darrièra pagina
pdfjs-last-page-button-label = Anar a la darrièra pagina
pdfjs-page-rotate-cw-button =
    .title = Rotacion orària
pdfjs-page-rotate-cw-button-label = Rotacion orària
pdfjs-page-rotate-ccw-button =
    .title = Rotacion antiorària
pdfjs-page-rotate-ccw-button-label = Rotacion antiorària
pdfjs-cursor-text-select-tool-button =
    .title = Activar l'aisina de seleccion de tèxte
pdfjs-cursor-text-select-tool-button-label = Aisina de seleccion de tèxte
pdfjs-cursor-hand-tool-button =
    .title = Activar l’aisina man
pdfjs-cursor-hand-tool-button-label = Aisina man
pdfjs-scroll-page-button =
    .title = Activar lo defilament per pagina
pdfjs-scroll-page-button-label = Defilament per pagina
pdfjs-scroll-vertical-button =
    .title = Utilizar lo defilament vertical
pdfjs-scroll-vertical-button-label = Defilament vertical
pdfjs-scroll-horizontal-button =
    .title = Utilizar lo defilament orizontal
pdfjs-scroll-horizontal-button-label = Defilament orizontal
pdfjs-scroll-wrapped-button =
    .title = Activar lo defilament continú
pdfjs-scroll-wrapped-button-label = Defilament continú
pdfjs-spread-none-button =
    .title = Agropar pas las paginas doas a doas
pdfjs-spread-none-button-label = Una sola pagina
pdfjs-spread-odd-button =
    .title = Mostrar doas paginas en començant per las paginas imparas a esquèrra
pdfjs-spread-odd-button-label = Dobla pagina, impara a drecha
pdfjs-spread-even-button =
    .title = Mostrar doas paginas en començant per las paginas paras a esquèrra
pdfjs-spread-even-button-label = Dobla pagina, para a drecha

## Document properties dialog

pdfjs-document-properties-button =
    .title = Proprietats del document…
pdfjs-document-properties-button-label = Proprietats del document…
pdfjs-document-properties-file-name = Nom del fichièr :
pdfjs-document-properties-file-size = Talha del fichièr :
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } Ko ({ $size_b } octets)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } Mo ({ $size_b } octets)
pdfjs-document-properties-title = Títol :
pdfjs-document-properties-author = Autor :
pdfjs-document-properties-subject = Subjècte :
pdfjs-document-properties-keywords = Mots claus :
pdfjs-document-properties-creation-date = Data de creacion :
pdfjs-document-properties-modification-date = Data de modificacion :
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, a { $time }
pdfjs-document-properties-creator = Creator :
pdfjs-document-properties-producer = Aisina de conversion PDF :
pdfjs-document-properties-version = Version PDF :
pdfjs-document-properties-page-count = Nombre de paginas :
pdfjs-document-properties-page-size = Talha de la pagina :
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = retrach
pdfjs-document-properties-page-size-orientation-landscape = païsatge
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Letra
pdfjs-document-properties-page-size-name-legal = Document juridic

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = Vista web rapida :
pdfjs-document-properties-linearized-yes = Òc
pdfjs-document-properties-linearized-no = Non
pdfjs-document-properties-close-button = Tampar

## Print

pdfjs-print-progress-message = Preparacion del document per l’impression…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Anullar
pdfjs-printing-not-supported = Atencion : l'impression es pas complètament gerida per aqueste navegador.
pdfjs-printing-not-ready = Atencion : lo PDF es pas entièrament cargat per lo poder imprimir.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Afichar/amagar lo panèl lateral
pdfjs-toggle-sidebar-notification-button =
    .title = Afichar/amagar lo panèl lateral (lo document conten esquèmas/pèças juntas/calques)
pdfjs-toggle-sidebar-button-label = Afichar/amagar lo panèl lateral
pdfjs-document-outline-button =
    .title = Mostrar los esquèmas del document (dobleclicar per espandre/reduire totes los elements)
pdfjs-document-outline-button-label = Marcapaginas del document
pdfjs-attachments-button =
    .title = Visualizar las pèças juntas
pdfjs-attachments-button-label = Pèças juntas
pdfjs-layers-button =
    .title = Afichar los calques (doble-clicar per reïnicializar totes los calques a l’estat per defaut)
pdfjs-layers-button-label = Calques
pdfjs-thumbs-button =
    .title = Afichar las vinhetas
pdfjs-thumbs-button-label = Vinhetas
pdfjs-current-outline-item-button =
    .title = Trobar l’element de plan actual
pdfjs-current-outline-item-button-label = Element de plan actual
pdfjs-findbar-button =
    .title = Cercar dins lo document
pdfjs-findbar-button-label = Recercar
pdfjs-additional-layers = Calques suplementaris

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pagina { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Vinheta de la pagina { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Recercar
    .placeholder = Cercar dins lo document…
pdfjs-find-previous-button =
    .title = Tròba l'ocurréncia precedenta de la frasa
pdfjs-find-previous-button-label = Precedent
pdfjs-find-next-button =
    .title = Tròba l'ocurréncia venenta de la frasa
pdfjs-find-next-button-label = Seguent
pdfjs-find-highlight-checkbox = Suslinhar tot
pdfjs-find-match-case-checkbox-label = Respectar la cassa
pdfjs-find-match-diacritics-checkbox-label = Respectar los diacritics
pdfjs-find-entire-word-checkbox-label = Mots entièrs
pdfjs-find-reached-top = Naut de la pagina atenh, perseguida del bas
pdfjs-find-reached-bottom = Bas de la pagina atench, perseguida al començament
pdfjs-find-not-found = Frasa pas trobada

## Predefined zoom values

pdfjs-page-scale-width = Largor plena
pdfjs-page-scale-fit = Pagina entièra
pdfjs-page-scale-auto = Zoom automatic
pdfjs-page-scale-actual = Talha vertadièra
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Pagina { $page }

## Loading indicator messages

pdfjs-loading-error = Una error s'es producha pendent lo cargament del fichièr PDF.
pdfjs-invalid-file-error = Fichièr PDF invalid o corromput.
pdfjs-missing-file-error = Fichièr PDF mancant.
pdfjs-unexpected-response-error = Responsa de servidor imprevista.
pdfjs-rendering-error = Una error s'es producha pendent l'afichatge de la pagina.

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date } a { $time }
# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [Anotacion { $type }]

## Password

pdfjs-password-label = Picatz lo senhal per dobrir aqueste fichièr PDF.
pdfjs-password-invalid = Senhal incorrècte. Tornatz ensajar.
pdfjs-password-ok-button = D'acòrdi
pdfjs-password-cancel-button = Anullar
pdfjs-web-fonts-disabled = Las polissas web son desactivadas : impossible d'utilizar las polissas integradas al PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Tèxte
pdfjs-editor-free-text-button-label = Tèxte
pdfjs-editor-ink-button =
    .title = Dessenhar
pdfjs-editor-ink-button-label = Dessenhar
pdfjs-editor-stamp-button =
    .title = Apondre o modificar d’imatges
pdfjs-editor-stamp-button-label = Apondre o modificar d’imatges

## Remove button for the various kind of editor.

pdfjs-editor-remove-freetext-button =
    .title = Suprimir lo tèxte
pdfjs-editor-remove-stamp-button =
    .title = Suprimir l’imatge

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Color
pdfjs-editor-free-text-size-input = Talha
pdfjs-editor-ink-color-input = Color
pdfjs-editor-ink-thickness-input = Espessor
pdfjs-editor-ink-opacity-input = Opacitat
pdfjs-editor-stamp-add-image-button =
    .title = Apondre imatge
pdfjs-editor-stamp-add-image-button-label = Apondre imatge
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Espessor
pdfjs-free-text =
    .aria-label = Editor de tèxte
pdfjs-free-text-default-content = Començatz d’escriure…
pdfjs-ink =
    .aria-label = Editor de dessenh
pdfjs-ink-canvas =
    .aria-label = Imatge creat per l’utilizaire

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Tèxt alternatiu
pdfjs-editor-alt-text-edit-button-label = Modificar lo tèxt alternatiu
pdfjs-editor-alt-text-dialog-label = Causir una opcion
pdfjs-editor-alt-text-add-description-label = Apondre una descripcion
pdfjs-editor-alt-text-cancel-button = Anullar
pdfjs-editor-alt-text-save-button = Enregistrar

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.


## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Color de suslinhatge
pdfjs-editor-colorpicker-button =
    .title = Cambiar de color
pdfjs-editor-colorpicker-yellow =
    .title = Jaune
pdfjs-editor-colorpicker-green =
    .title = Verd
pdfjs-editor-colorpicker-blue =
    .title = Blau
pdfjs-editor-colorpicker-pink =
    .title = Ròse
pdfjs-editor-colorpicker-red =
    .title = Roge

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = O afichar tot
pdfjs-editor-highlight-show-all-button =
    .title = O afichar tot
