# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pagjine precedente
pdfjs-previous-button-label = Indaûr
pdfjs-next-button =
    .title = Prossime pagjine
pdfjs-next-button-label = Indevant
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pagjine
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = di { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } di { $pagesCount })
pdfjs-zoom-out-button =
    .title = Impiçulìs
pdfjs-zoom-out-button-label = Impiçulìs
pdfjs-zoom-in-button =
    .title = Ingrandìs
pdfjs-zoom-in-button-label = Ingrandìs
pdfjs-zoom-select =
    .title = Ingrandiment
pdfjs-presentation-mode-button =
    .title = Passe ae modalitât presentazion
pdfjs-presentation-mode-button-label = Modalitât presentazion
pdfjs-open-file-button =
    .title = Vierç un file
pdfjs-open-file-button-label = Vierç
pdfjs-print-button =
    .title = Stampe
pdfjs-print-button-label = Stampe
pdfjs-save-button =
    .title = Salve
pdfjs-save-button-label = Salve
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Discjame
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Discjame
pdfjs-bookmark-button =
    .title = Pagjine corinte (mostre URL de pagjine atuâl)
pdfjs-bookmark-button-label = Pagjine corinte
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Vierç te aplicazion
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Vierç te aplicazion

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Struments
pdfjs-tools-button-label = Struments
pdfjs-first-page-button =
    .title = Va ae prime pagjine
pdfjs-first-page-button-label = Va ae prime pagjine
pdfjs-last-page-button =
    .title = Va ae ultime pagjine
pdfjs-last-page-button-label = Va ae ultime pagjine
pdfjs-page-rotate-cw-button =
    .title = Zire in sens orari
pdfjs-page-rotate-cw-button-label = Zire in sens orari
pdfjs-page-rotate-ccw-button =
    .title = Zire in sens antiorari
pdfjs-page-rotate-ccw-button-label = Zire in sens antiorari
pdfjs-cursor-text-select-tool-button =
    .title = Ative il strument di selezion dal test
pdfjs-cursor-text-select-tool-button-label = Strument di selezion dal test
pdfjs-cursor-hand-tool-button =
    .title = Ative il strument manute
pdfjs-cursor-hand-tool-button-label = Strument manute
pdfjs-scroll-page-button =
    .title = Dopre il scoriment des pagjinis
pdfjs-scroll-page-button-label = Scoriment pagjinis
pdfjs-scroll-vertical-button =
    .title = Dopre scoriment verticâl
pdfjs-scroll-vertical-button-label = Scoriment verticâl
pdfjs-scroll-horizontal-button =
    .title = Dopre scoriment orizontâl
pdfjs-scroll-horizontal-button-label = Scoriment orizontâl
pdfjs-scroll-wrapped-button =
    .title = Dopre scoriment par blocs
pdfjs-scroll-wrapped-button-label = Scoriment par blocs
pdfjs-spread-none-button =
    .title = No sta meti dongje pagjinis in cubie
pdfjs-spread-none-button-label = No cubiis di pagjinis
pdfjs-spread-odd-button =
    .title = Met dongje cubiis di pagjinis scomençant des pagjinis dispar
pdfjs-spread-odd-button-label = Cubiis di pagjinis, dispar a çampe
pdfjs-spread-even-button =
    .title = Met dongje cubiis di pagjinis scomençant des pagjinis pâr
pdfjs-spread-even-button-label = Cubiis di pagjinis, pâr a çampe

## Document properties dialog

pdfjs-document-properties-button =
    .title = Proprietâts dal document…
pdfjs-document-properties-button-label = Proprietâts dal document…
pdfjs-document-properties-file-name = Non dal file:
pdfjs-document-properties-file-size = Dimension dal file:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Titul:
pdfjs-document-properties-author = Autôr:
pdfjs-document-properties-subject = Ogjet:
pdfjs-document-properties-keywords = Peraulis clâf:
pdfjs-document-properties-creation-date = Date di creazion:
pdfjs-document-properties-modification-date = Date di modifiche:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Creatôr
pdfjs-document-properties-producer = Gjeneradôr PDF:
pdfjs-document-properties-version = Version PDF:
pdfjs-document-properties-page-count = Numar di pagjinis:
pdfjs-document-properties-page-size = Dimension de pagjine:
pdfjs-document-properties-page-size-unit-inches = oncis
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = verticâl
pdfjs-document-properties-page-size-orientation-landscape = orizontâl
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Letare
pdfjs-document-properties-page-size-name-legal = Legâl

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
pdfjs-document-properties-linearized = Visualizazion web svelte:
pdfjs-document-properties-linearized-yes = Sì
pdfjs-document-properties-linearized-no = No
pdfjs-document-properties-close-button = Siere

## Print

pdfjs-print-progress-message = Daûr a prontâ il document pe stampe…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Anule
pdfjs-printing-not-supported = Atenzion: la stampe no je supuartade ad implen di chest navigadôr.
pdfjs-printing-not-ready = Atenzion: il PDF nol è stât cjamât dal dut pe stampe.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Ative/Disative sbare laterâl
pdfjs-toggle-sidebar-notification-button =
    .title = Ative/Disative sbare laterâl (il document al conten struture/zontis/strâts)
pdfjs-toggle-sidebar-button-label = Ative/Disative sbare laterâl
pdfjs-document-outline-button =
    .title = Mostre la struture dal document (dopli clic par slargjâ/strenzi ducj i elements)
pdfjs-document-outline-button-label = Struture dal document
pdfjs-attachments-button =
    .title = Mostre lis zontis
pdfjs-attachments-button-label = Zontis
pdfjs-layers-button =
    .title = Mostre i strâts (dopli clic par ristabilî ducj i strâts al stât predefinît)
pdfjs-layers-button-label = Strâts
pdfjs-thumbs-button =
    .title = Mostre miniaturis
pdfjs-thumbs-button-label = Miniaturis
pdfjs-current-outline-item-button =
    .title = Cjate l'element de struture atuâl
pdfjs-current-outline-item-button-label = Element de struture atuâl
pdfjs-findbar-button =
    .title = Cjate tal document
pdfjs-findbar-button-label = Cjate
pdfjs-additional-layers = Strâts adizionâi

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pagjine { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniature de pagjine { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Cjate
    .placeholder = Cjate tal document…
pdfjs-find-previous-button =
    .title = Cjate il câs precedent dal test
pdfjs-find-previous-button-label = Precedent
pdfjs-find-next-button =
    .title = Cjate il câs sucessîf dal test
pdfjs-find-next-button-label = Sucessîf
pdfjs-find-highlight-checkbox = Evidenzie dut
pdfjs-find-match-case-checkbox-label = Fâs distinzion tra maiusculis e minusculis
pdfjs-find-match-diacritics-checkbox-label = Corispondence diacritiche
pdfjs-find-entire-word-checkbox-label = Peraulis interiis
pdfjs-find-reached-top = Si è rivâts al inizi dal document e si à continuât de fin
pdfjs-find-reached-bottom = Si è rivât ae fin dal document e si à continuât dal inizi
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } di { $total } corispondence
       *[other] { $current } di { $total } corispondencis
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Plui di { $limit } corispondence
       *[other] Plui di { $limit } corispondencis
    }
pdfjs-find-not-found = Test no cjatât

## Predefined zoom values

pdfjs-page-scale-width = Largjece de pagjine
pdfjs-page-scale-fit = Pagjine interie
pdfjs-page-scale-auto = Ingrandiment automatic
pdfjs-page-scale-actual = Dimension reâl
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Pagjine { $page }

## Loading indicator messages

pdfjs-loading-error = Al è vignût fûr un erôr intant che si cjariave il PDF.
pdfjs-invalid-file-error = File PDF no valit o ruvinât.
pdfjs-missing-file-error = Al mancje il file PDF.
pdfjs-unexpected-response-error = Rispueste dal servidôr inspietade.
pdfjs-rendering-error = Al è vignût fûr un erôr tal realizâ la visualizazion de pagjine.

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
    .alt = [Anotazion { $type }]

## Password

pdfjs-password-label = Inserìs la password par vierzi chest file PDF.
pdfjs-password-invalid = Password no valide. Par plasê torne prove.
pdfjs-password-ok-button = Va ben
pdfjs-password-cancel-button = Anule
pdfjs-web-fonts-disabled = I caratars dal Web a son disativâts: Impussibil doprâ i caratars PDF incorporâts.

## Editing

pdfjs-editor-free-text-button =
    .title = Test
pdfjs-editor-free-text-button-label = Test
pdfjs-editor-ink-button =
    .title = Dissen
pdfjs-editor-ink-button-label = Dissen
pdfjs-editor-stamp-button =
    .title = Zonte o modifiche imagjins
pdfjs-editor-stamp-button-label = Zonte o modifiche imagjins
pdfjs-editor-highlight-button =
    .title = Evidenzie
pdfjs-editor-highlight-button-label = Evidenzie
pdfjs-highlight-floating-button =
    .title = Evidenzie
pdfjs-highlight-floating-button1 =
    .title = Evidenzie
    .aria-label = Evidenzie
pdfjs-highlight-floating-button-label = Evidenzie

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Gjave dissen
pdfjs-editor-remove-freetext-button =
    .title = Gjave test
pdfjs-editor-remove-stamp-button =
    .title = Gjave imagjin
pdfjs-editor-remove-highlight-button =
    .title = Gjave evidenziazion

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Colôr
pdfjs-editor-free-text-size-input = Dimension
pdfjs-editor-ink-color-input = Colôr
pdfjs-editor-ink-thickness-input = Spessôr
pdfjs-editor-ink-opacity-input = Opacitât
pdfjs-editor-stamp-add-image-button =
    .title = Zonte imagjin
pdfjs-editor-stamp-add-image-button-label = Zonte imagjin
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Spessôr
pdfjs-editor-free-highlight-thickness-title =
    .title = Modifiche il spessôr de selezion pai elements che no son testuâi
pdfjs-free-text =
    .aria-label = Editôr di test
pdfjs-free-text-default-content = Scomence a scrivi…
pdfjs-ink =
    .aria-label = Editôr dissens
pdfjs-ink-canvas =
    .aria-label = Imagjin creade dal utent

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Test alternatîf
pdfjs-editor-alt-text-edit-button-label = Modifiche test alternatîf
pdfjs-editor-alt-text-dialog-label = Sielç une opzion
pdfjs-editor-alt-text-dialog-description = Il test alternatîf (“alt text”) al jude cuant che lis personis no puedin viodi la imagjin o cuant che la imagjine no ven cjariade.
pdfjs-editor-alt-text-add-description-label = Zonte une descrizion
pdfjs-editor-alt-text-add-description-description = Ponte a une o dôs frasis che a descrivin l’argoment, la ambientazion o lis azions.
pdfjs-editor-alt-text-mark-decorative-label = Segne come decorative
pdfjs-editor-alt-text-mark-decorative-description = Chest al ven doprât pes imagjins ornamentâls, come i ôrs o lis filigranis.
pdfjs-editor-alt-text-cancel-button = Anule
pdfjs-editor-alt-text-save-button = Salve
pdfjs-editor-alt-text-decorative-tooltip = Segnade come decorative
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Par esempli, “Un zovin si sente a taule par mangjâ”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Cjanton in alt a çampe — ridimensione
pdfjs-editor-resizer-label-top-middle = Bande superiôr tal mieç — ridimensione
pdfjs-editor-resizer-label-top-right = Cjanton in alt a diestre — ridimensione
pdfjs-editor-resizer-label-middle-right = Bande diestre tal mieç — ridimensione
pdfjs-editor-resizer-label-bottom-right = Cjanton in bas a diestre — ridimensione
pdfjs-editor-resizer-label-bottom-middle = Bande inferiôr tal mieç — ridimensione
pdfjs-editor-resizer-label-bottom-left = Cjanton in bas a çampe — ridimensione
pdfjs-editor-resizer-label-middle-left = Bande di çampe tal mieç — ridimensione

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Colôr par evidenziâ
pdfjs-editor-colorpicker-button =
    .title = Cambie colôr
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Sieltis di colôr
pdfjs-editor-colorpicker-yellow =
    .title = Zâl
pdfjs-editor-colorpicker-green =
    .title = Vert
pdfjs-editor-colorpicker-blue =
    .title = Blu
pdfjs-editor-colorpicker-pink =
    .title = Rose
pdfjs-editor-colorpicker-red =
    .title = Ros

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Mostre dut
pdfjs-editor-highlight-show-all-button =
    .title = Mostre dut
