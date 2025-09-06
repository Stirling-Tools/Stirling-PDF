# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Aurreko orria
pdfjs-previous-button-label = Aurrekoa
pdfjs-next-button =
    .title = Hurrengo orria
pdfjs-next-button-label = Hurrengoa
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Orria
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = / { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = { $pagesCount }/{ $pageNumber }
pdfjs-zoom-out-button =
    .title = Urrundu zooma
pdfjs-zoom-out-button-label = Urrundu zooma
pdfjs-zoom-in-button =
    .title = Gerturatu zooma
pdfjs-zoom-in-button-label = Gerturatu zooma
pdfjs-zoom-select =
    .title = Zooma
pdfjs-presentation-mode-button =
    .title = Aldatu aurkezpen modura
pdfjs-presentation-mode-button-label = Arkezpen modua
pdfjs-open-file-button =
    .title = Ireki fitxategia
pdfjs-open-file-button-label = Ireki
pdfjs-print-button =
    .title = Inprimatu
pdfjs-print-button-label = Inprimatu
pdfjs-save-button =
    .title = Gorde
pdfjs-save-button-label = Gorde
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Deskargatu
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Deskargatu
pdfjs-bookmark-button =
    .title = Uneko orria (ikusi uneko orriaren URLa)
pdfjs-bookmark-button-label = Uneko orria
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Ireki aplikazioan
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Ireki aplikazioan

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Tresnak
pdfjs-tools-button-label = Tresnak
pdfjs-first-page-button =
    .title = Joan lehen orrira
pdfjs-first-page-button-label = Joan lehen orrira
pdfjs-last-page-button =
    .title = Joan azken orrira
pdfjs-last-page-button-label = Joan azken orrira
pdfjs-page-rotate-cw-button =
    .title = Biratu erlojuaren norantzan
pdfjs-page-rotate-cw-button-label = Biratu erlojuaren norantzan
pdfjs-page-rotate-ccw-button =
    .title = Biratu erlojuaren aurkako norantzan
pdfjs-page-rotate-ccw-button-label = Biratu erlojuaren aurkako norantzan
pdfjs-cursor-text-select-tool-button =
    .title = Gaitu testuaren hautapen tresna
pdfjs-cursor-text-select-tool-button-label = Testuaren hautapen tresna
pdfjs-cursor-hand-tool-button =
    .title = Gaitu eskuaren tresna
pdfjs-cursor-hand-tool-button-label = Eskuaren tresna
pdfjs-scroll-page-button =
    .title = Erabili orriaren korritzea
pdfjs-scroll-page-button-label = Orriaren korritzea
pdfjs-scroll-vertical-button =
    .title = Erabili korritze bertikala
pdfjs-scroll-vertical-button-label = Korritze bertikala
pdfjs-scroll-horizontal-button =
    .title = Erabili korritze horizontala
pdfjs-scroll-horizontal-button-label = Korritze horizontala
pdfjs-scroll-wrapped-button =
    .title = Erabili korritze egokitua
pdfjs-scroll-wrapped-button-label = Korritze egokitua
pdfjs-spread-none-button =
    .title = Ez elkartu barreiatutako orriak
pdfjs-spread-none-button-label = Barreiatzerik ez
pdfjs-spread-odd-button =
    .title = Elkartu barreiatutako orriak bakoiti zenbakidunekin hasita
pdfjs-spread-odd-button-label = Barreiatze bakoitia
pdfjs-spread-even-button =
    .title = Elkartu barreiatutako orriak bikoiti zenbakidunekin hasita
pdfjs-spread-even-button-label = Barreiatze bikoitia

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumentuaren propietateak…
pdfjs-document-properties-button-label = Dokumentuaren propietateak…
pdfjs-document-properties-file-name = Fitxategi-izena:
pdfjs-document-properties-file-size = Fitxategiaren tamaina:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } byte)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } byte)
pdfjs-document-properties-title = Izenburua:
pdfjs-document-properties-author = Egilea:
pdfjs-document-properties-subject = Gaia:
pdfjs-document-properties-keywords = Gako-hitzak:
pdfjs-document-properties-creation-date = Sortze-data:
pdfjs-document-properties-modification-date = Aldatze-data:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Sortzailea:
pdfjs-document-properties-producer = PDFaren ekoizlea:
pdfjs-document-properties-version = PDF bertsioa:
pdfjs-document-properties-page-count = Orrialde kopurua:
pdfjs-document-properties-page-size = Orriaren tamaina:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = bertikala
pdfjs-document-properties-page-size-orientation-landscape = horizontala
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Gutuna
pdfjs-document-properties-page-size-name-legal = Legala

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
pdfjs-document-properties-linearized = Webeko ikuspegi bizkorra:
pdfjs-document-properties-linearized-yes = Bai
pdfjs-document-properties-linearized-no = Ez
pdfjs-document-properties-close-button = Itxi

## Print

pdfjs-print-progress-message = Dokumentua inprimatzeko prestatzen…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = %{ $progress }
pdfjs-print-progress-close-button = Utzi
pdfjs-printing-not-supported = Abisua: inprimatzeko euskarria ez da erabatekoa nabigatzaile honetan.
pdfjs-printing-not-ready = Abisua: PDFa ez dago erabat kargatuta inprimatzeko.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Txandakatu alboko barra
pdfjs-toggle-sidebar-notification-button =
    .title = Txandakatu alboko barra (dokumentuak eskema/eranskinak/geruzak ditu)
pdfjs-toggle-sidebar-button-label = Txandakatu alboko barra
pdfjs-document-outline-button =
    .title = Erakutsi dokumentuaren eskema (klik bikoitza elementu guztiak zabaltzeko/tolesteko)
pdfjs-document-outline-button-label = Dokumentuaren eskema
pdfjs-attachments-button =
    .title = Erakutsi eranskinak
pdfjs-attachments-button-label = Eranskinak
pdfjs-layers-button =
    .title = Erakutsi geruzak (klik bikoitza geruza guztiak egoera lehenetsira berrezartzeko)
pdfjs-layers-button-label = Geruzak
pdfjs-thumbs-button =
    .title = Erakutsi koadro txikiak
pdfjs-thumbs-button-label = Koadro txikiak
pdfjs-current-outline-item-button =
    .title = Bilatu uneko eskemaren elementua
pdfjs-current-outline-item-button-label = Uneko eskemaren elementua
pdfjs-findbar-button =
    .title = Bilatu dokumentuan
pdfjs-findbar-button-label = Bilatu
pdfjs-additional-layers = Geruza gehigarriak

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = { $page }. orria
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page }. orriaren koadro txikia

## Find panel button title and messages

pdfjs-find-input =
    .title = Bilatu
    .placeholder = Bilatu dokumentuan…
pdfjs-find-previous-button =
    .title = Bilatu esaldiaren aurreko parekatzea
pdfjs-find-previous-button-label = Aurrekoa
pdfjs-find-next-button =
    .title = Bilatu esaldiaren hurrengo parekatzea
pdfjs-find-next-button-label = Hurrengoa
pdfjs-find-highlight-checkbox = Nabarmendu guztia
pdfjs-find-match-case-checkbox-label = Bat etorri maiuskulekin/minuskulekin
pdfjs-find-match-diacritics-checkbox-label = Bereizi diakritikoak
pdfjs-find-entire-word-checkbox-label = Hitz osoak
pdfjs-find-reached-top = Dokumentuaren hasierara heldu da, bukaeratik jarraitzen
pdfjs-find-reached-bottom = Dokumentuaren bukaerara heldu da, hasieratik jarraitzen
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $total }/{ $current }. bat-etortzea
       *[other] { $total }/{ $current }. bat-etortzea
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Bat datorren { $limit } baino gehiago
       *[other] Bat datozen { $limit } baino gehiago
    }
pdfjs-find-not-found = Esaldia ez da aurkitu

## Predefined zoom values

pdfjs-page-scale-width = Orriaren zabalera
pdfjs-page-scale-fit = Doitu orrira
pdfjs-page-scale-auto = Zoom automatikoa
pdfjs-page-scale-actual = Benetako tamaina
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = %{ $scale }

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = { $page }. orria

## Loading indicator messages

pdfjs-loading-error = Errorea gertatu da PDFa kargatzean.
pdfjs-invalid-file-error = PDF fitxategi baliogabe edo hondatua.
pdfjs-missing-file-error = PDF fitxategia falta da.
pdfjs-unexpected-response-error = Espero gabeko zerbitzariaren erantzuna.
pdfjs-rendering-error = Errorea gertatu da orria errendatzean.

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
    .alt = [{ $type } ohartarazpena]

## Password

pdfjs-password-label = Idatzi PDF fitxategi hau irekitzeko pasahitza.
pdfjs-password-invalid = Pasahitz baliogabea. Saiatu berriro mesedez.
pdfjs-password-ok-button = Ados
pdfjs-password-cancel-button = Utzi
pdfjs-web-fonts-disabled = Webeko letra-tipoak desgaituta daude: ezin dira kapsulatutako PDF letra-tipoak erabili.

## Editing

pdfjs-editor-free-text-button =
    .title = Testua
pdfjs-editor-free-text-button-label = Testua
pdfjs-editor-ink-button =
    .title = Marrazkia
pdfjs-editor-ink-button-label = Marrazkia
pdfjs-editor-stamp-button =
    .title = Gehitu edo editatu irudiak
pdfjs-editor-stamp-button-label = Gehitu edo editatu irudiak
pdfjs-editor-highlight-button =
    .title = Nabarmendu
pdfjs-editor-highlight-button-label = Nabarmendu
pdfjs-highlight-floating-button =
    .title = Nabarmendu
pdfjs-highlight-floating-button1 =
    .title = Nabarmendu
    .aria-label = Nabarmendu
pdfjs-highlight-floating-button-label = Nabarmendu

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Kendu marrazkia
pdfjs-editor-remove-freetext-button =
    .title = Kendu testua
pdfjs-editor-remove-stamp-button =
    .title = Kendu irudia
pdfjs-editor-remove-highlight-button =
    .title = Kendu nabarmentzea

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Kolorea
pdfjs-editor-free-text-size-input = Tamaina
pdfjs-editor-ink-color-input = Kolorea
pdfjs-editor-ink-thickness-input = Loditasuna
pdfjs-editor-ink-opacity-input = Opakutasuna
pdfjs-editor-stamp-add-image-button =
    .title = Gehitu irudia
pdfjs-editor-stamp-add-image-button-label = Gehitu irudia
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Loditasuna
pdfjs-editor-free-highlight-thickness-title =
    .title = Aldatu loditasuna testua ez beste elementuak nabarmentzean
pdfjs-free-text =
    .aria-label = Testu-editorea
pdfjs-free-text-default-content = Hasi idazten…
pdfjs-ink =
    .aria-label = Marrazki-editorea
pdfjs-ink-canvas =
    .aria-label = Erabiltzaileak sortutako irudia

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Testu alternatiboa
pdfjs-editor-alt-text-edit-button-label = Editatu testu alternatiboa
pdfjs-editor-alt-text-dialog-label = Aukeratu aukera
pdfjs-editor-alt-text-dialog-description = Testu alternatiboak laguntzen du jendeak ezin duenean irudia ikusi edo ez denean kargatzen.
pdfjs-editor-alt-text-add-description-label = Gehitu azalpena
pdfjs-editor-alt-text-add-description-description = Saiatu idazten gaia, ezarpena edo ekintzak deskribatzen dituen esaldi 1 edo 2.
pdfjs-editor-alt-text-mark-decorative-label = Markatu apaingarri gisa
pdfjs-editor-alt-text-mark-decorative-description = Irudiak apaingarrientzat erabiltzen da, adibidez ertz edo ur-marketarako.
pdfjs-editor-alt-text-cancel-button = Utzi
pdfjs-editor-alt-text-save-button = Gorde
pdfjs-editor-alt-text-decorative-tooltip = Apaingarri gisa markatuta
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Adibidez, "gizon gaztea mahaian eserita dago bazkaltzeko"

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Goiko ezkerreko izkina — aldatu tamaina
pdfjs-editor-resizer-label-top-middle = Goian erdian — aldatu tamaina
pdfjs-editor-resizer-label-top-right = Goiko eskuineko izkina — aldatu tamaina
pdfjs-editor-resizer-label-middle-right = Erdian eskuinean — aldatu tamaina
pdfjs-editor-resizer-label-bottom-right = Beheko eskuineko izkina — aldatu tamaina
pdfjs-editor-resizer-label-bottom-middle = Behean erdian — aldatu tamaina
pdfjs-editor-resizer-label-bottom-left = Beheko ezkerreko izkina — aldatu tamaina
pdfjs-editor-resizer-label-middle-left = Erdian ezkerrean —  aldatu tamaina

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Nabarmentze kolorea
pdfjs-editor-colorpicker-button =
    .title = Aldatu kolorea
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Kolore-aukerak
pdfjs-editor-colorpicker-yellow =
    .title = Horia
pdfjs-editor-colorpicker-green =
    .title = Berdea
pdfjs-editor-colorpicker-blue =
    .title = Urdina
pdfjs-editor-colorpicker-pink =
    .title = Arrosa
pdfjs-editor-colorpicker-red =
    .title = Gorria

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Erakutsi denak
pdfjs-editor-highlight-show-all-button =
    .title = Erakutsi denak
