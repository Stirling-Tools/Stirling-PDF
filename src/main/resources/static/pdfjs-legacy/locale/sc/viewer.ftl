# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pàgina anteriore
pdfjs-previous-button-label = S'ischeda chi b'est primu
pdfjs-next-button =
    .title = Pàgina imbeniente
pdfjs-next-button-label = Imbeniente
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pàgina
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = de { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } de { $pagesCount })
pdfjs-zoom-out-button =
    .title = Impitica
pdfjs-zoom-out-button-label = Impitica
pdfjs-zoom-in-button =
    .title = Ismànnia
pdfjs-zoom-in-button-label = Ismànnia
pdfjs-zoom-select =
    .title = Ismànnia
pdfjs-presentation-mode-button =
    .title = Cola a sa modalidade de presentatzione
pdfjs-presentation-mode-button-label = Modalidade de presentatzione
pdfjs-open-file-button =
    .title = Aberi s'archìviu
pdfjs-open-file-button-label = Abertu
pdfjs-print-button =
    .title = Imprenta
pdfjs-print-button-label = Imprenta
pdfjs-save-button =
    .title = Sarva
pdfjs-save-button-label = Sarva
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Iscàrriga
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Iscàrriga
pdfjs-bookmark-button =
    .title = Pàgina atuale (ammustra s’URL de sa pàgina atuale)
pdfjs-bookmark-button-label = Pàgina atuale
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Aberi in un’aplicatzione
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Aberi in un’aplicatzione

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Istrumentos
pdfjs-tools-button-label = Istrumentos
pdfjs-first-page-button =
    .title = Bae a sa prima pàgina
pdfjs-first-page-button-label = Bae a sa prima pàgina
pdfjs-last-page-button =
    .title = Bae a s'ùrtima pàgina
pdfjs-last-page-button-label = Bae a s'ùrtima pàgina
pdfjs-page-rotate-cw-button =
    .title = Gira in sensu oràriu
pdfjs-page-rotate-cw-button-label = Gira in sensu oràriu
pdfjs-page-rotate-ccw-button =
    .title = Gira in sensu anti-oràriu
pdfjs-page-rotate-ccw-button-label = Gira in sensu anti-oràriu
pdfjs-cursor-text-select-tool-button =
    .title = Ativa s'aina de seletzione de testu
pdfjs-cursor-text-select-tool-button-label = Aina de seletzione de testu
pdfjs-cursor-hand-tool-button =
    .title = Ativa s'aina de manu
pdfjs-cursor-hand-tool-button-label = Aina de manu
pdfjs-scroll-page-button =
    .title = Imprea s'iscurrimentu de pàgina
pdfjs-scroll-page-button-label = Iscurrimentu de pàgina
pdfjs-scroll-vertical-button =
    .title = Imprea s'iscurrimentu verticale
pdfjs-scroll-vertical-button-label = Iscurrimentu verticale
pdfjs-scroll-horizontal-button =
    .title = Imprea s'iscurrimentu orizontale
pdfjs-scroll-horizontal-button-label = Iscurrimentu orizontale
pdfjs-scroll-wrapped-button =
    .title = Imprea s'iscurrimentu continu
pdfjs-scroll-wrapped-button-label = Iscurrimentu continu

## Document properties dialog

pdfjs-document-properties-button =
    .title = Propiedades de su documentu…
pdfjs-document-properties-button-label = Propiedades de su documentu…
pdfjs-document-properties-file-name = Nòmine de s'archìviu:
pdfjs-document-properties-file-size = Mannària de s'archìviu:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Tìtulu:
pdfjs-document-properties-author = Autoria:
pdfjs-document-properties-subject = Ogetu:
pdfjs-document-properties-keywords = Faeddos crae:
pdfjs-document-properties-creation-date = Data de creatzione:
pdfjs-document-properties-modification-date = Data de modìfica:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Creatzione:
pdfjs-document-properties-producer = Produtore de PDF:
pdfjs-document-properties-version = Versione de PDF:
pdfjs-document-properties-page-count = Contu de pàginas:
pdfjs-document-properties-page-size = Mannària de sa pàgina:
pdfjs-document-properties-page-size-unit-inches = pòddighes
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = verticale
pdfjs-document-properties-page-size-orientation-landscape = orizontale
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Lìtera
pdfjs-document-properties-page-size-name-legal = Legale

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
pdfjs-document-properties-linearized = Visualizatzione web lestra:
pdfjs-document-properties-linearized-yes = Eja
pdfjs-document-properties-linearized-no = Nono
pdfjs-document-properties-close-button = Serra

## Print

pdfjs-print-progress-message = Aparitzende s'imprenta de su documentu…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Cantzella
pdfjs-printing-not-supported = Atentzione: s'imprenta no est funtzionende de su totu in custu navigadore.
pdfjs-printing-not-ready = Atentzione: su PDF no est istadu carrigadu de su totu pro s'imprenta.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Ativa/disativa sa barra laterale
pdfjs-toggle-sidebar-notification-button =
    .title = Ativa/disativa sa barra laterale (su documentu cuntenet un'ischema, alligongiados o livellos)
pdfjs-toggle-sidebar-button-label = Ativa/disativa sa barra laterale
pdfjs-document-outline-button-label = Ischema de su documentu
pdfjs-attachments-button =
    .title = Ammustra alligongiados
pdfjs-attachments-button-label = Alliongiados
pdfjs-layers-button =
    .title = Ammustra livellos (clic dòpiu pro ripristinare totu is livellos a s'istadu predefinidu)
pdfjs-layers-button-label = Livellos
pdfjs-thumbs-button =
    .title = Ammustra miniaturas
pdfjs-thumbs-button-label = Miniaturas
pdfjs-current-outline-item-button =
    .title = Agata s'elementu atuale de s'ischema
pdfjs-current-outline-item-button-label = Elementu atuale de s'ischema
pdfjs-findbar-button =
    .title = Agata in su documentu
pdfjs-findbar-button-label = Agata
pdfjs-additional-layers = Livellos additzionales

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pàgina { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura de sa pàgina { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Agata
    .placeholder = Agata in su documentu…
pdfjs-find-previous-button =
    .title = Agata s'ocurrèntzia pretzedente de sa fràsia
pdfjs-find-previous-button-label = S'ischeda chi b'est primu
pdfjs-find-next-button =
    .title = Agata s'ocurrèntzia imbeniente de sa fràsia
pdfjs-find-next-button-label = Imbeniente
pdfjs-find-highlight-checkbox = Evidèntzia totu
pdfjs-find-match-case-checkbox-label = Distinghe intre majùsculas e minùsculas
pdfjs-find-match-diacritics-checkbox-label = Respeta is diacrìticos
pdfjs-find-entire-word-checkbox-label = Faeddos intreos
pdfjs-find-reached-top = S'est lòmpidu a su cumintzu de su documentu, si sighit dae su bàsciu
pdfjs-find-reached-bottom = Acabbu de su documentu, si sighit dae s'artu
pdfjs-find-not-found = Testu no agatadu

## Predefined zoom values

pdfjs-page-scale-auto = Ingrandimentu automàticu
pdfjs-page-scale-actual = Mannària reale
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Pàgina { $page }

## Loading indicator messages

pdfjs-loading-error = Faddina in sa càrriga de su PDF.
pdfjs-invalid-file-error = Archìviu PDF non vàlidu o corrùmpidu.
pdfjs-missing-file-error = Ammancat s'archìviu PDF.
pdfjs-unexpected-response-error = Risposta imprevista de su serbidore.
pdfjs-rendering-error = Faddina in sa visualizatzione de sa pàgina.

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date }, { $time }

## Password

pdfjs-password-label = Inserta sa crae pro abèrrere custu archìviu PDF.
pdfjs-password-invalid = Sa crae no est curreta. Torra a nche proare.
pdfjs-password-ok-button = Andat bene
pdfjs-password-cancel-button = Cantzella
pdfjs-web-fonts-disabled = Is tipografias web sunt disativadas: is tipografias incrustadas a su PDF non podent èssere impreadas.

## Editing

pdfjs-editor-free-text-button =
    .title = Testu
pdfjs-editor-free-text-button-label = Testu
pdfjs-editor-ink-button =
    .title = Disinnu
pdfjs-editor-ink-button-label = Disinnu
pdfjs-editor-stamp-button =
    .title = Agiunghe o modìfica immàgines
pdfjs-editor-stamp-button-label = Agiunghe o modìfica immàgines
# Editor Parameters
pdfjs-editor-free-text-color-input = Colore
pdfjs-editor-free-text-size-input = Mannària
pdfjs-editor-ink-color-input = Colore
pdfjs-editor-ink-thickness-input = Grussària
pdfjs-editor-stamp-add-image-button =
    .title = Agiunghe un’immàgine
pdfjs-editor-stamp-add-image-button-label = Agiunghe un’immàgine
pdfjs-free-text =
    .aria-label = Editore de testu
pdfjs-free-text-default-content = Cumintza a iscrìere…
pdfjs-ink =
    .aria-label = Editore de disinnos
pdfjs-ink-canvas =
    .aria-label = Immàgine creada dae s’utente

## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

