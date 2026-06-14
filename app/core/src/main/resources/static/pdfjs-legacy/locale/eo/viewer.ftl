# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Antaŭa paĝo
pdfjs-previous-button-label = Malantaŭen
pdfjs-next-button =
    .title = Venonta paĝo
pdfjs-next-button-label = Antaŭen
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Paĝo
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = el { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } el { $pagesCount })
pdfjs-zoom-out-button =
    .title = Malpligrandigi
pdfjs-zoom-out-button-label = Malpligrandigi
pdfjs-zoom-in-button =
    .title = Pligrandigi
pdfjs-zoom-in-button-label = Pligrandigi
pdfjs-zoom-select =
    .title = Pligrandigilo
pdfjs-presentation-mode-button =
    .title = Iri al prezenta reĝimo
pdfjs-presentation-mode-button-label = Prezenta reĝimo
pdfjs-open-file-button =
    .title = Malfermi dosieron
pdfjs-open-file-button-label = Malfermi
pdfjs-print-button =
    .title = Presi
pdfjs-print-button-label = Presi
pdfjs-save-button =
    .title = Konservi
pdfjs-save-button-label = Konservi
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Elŝuti
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Elŝuti
pdfjs-bookmark-button =
    .title = Nuna paĝo (Montri adreson de la nuna paĝo)
pdfjs-bookmark-button-label = Nuna paĝo

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Iloj
pdfjs-tools-button-label = Iloj
pdfjs-first-page-button =
    .title = Iri al la unua paĝo
pdfjs-first-page-button-label = Iri al la unua paĝo
pdfjs-last-page-button =
    .title = Iri al la lasta paĝo
pdfjs-last-page-button-label = Iri al la lasta paĝo
pdfjs-page-rotate-cw-button =
    .title = Rotaciigi dekstrume
pdfjs-page-rotate-cw-button-label = Rotaciigi dekstrume
pdfjs-page-rotate-ccw-button =
    .title = Rotaciigi maldekstrume
pdfjs-page-rotate-ccw-button-label = Rotaciigi maldekstrume
pdfjs-cursor-text-select-tool-button =
    .title = Aktivigi tekstan elektilon
pdfjs-cursor-text-select-tool-button-label = Teksta elektilo
pdfjs-cursor-hand-tool-button =
    .title = Aktivigi ilon de mano
pdfjs-cursor-hand-tool-button-label = Ilo de mano
pdfjs-scroll-page-button =
    .title = Uzi rulumon de paĝo
pdfjs-scroll-page-button-label = Rulumo de paĝo
pdfjs-scroll-vertical-button =
    .title = Uzi vertikalan rulumon
pdfjs-scroll-vertical-button-label = Vertikala rulumo
pdfjs-scroll-horizontal-button =
    .title = Uzi horizontalan rulumon
pdfjs-scroll-horizontal-button-label = Horizontala rulumo
pdfjs-scroll-wrapped-button =
    .title = Uzi ambaŭdirektan rulumon
pdfjs-scroll-wrapped-button-label = Ambaŭdirekta rulumo
pdfjs-spread-none-button =
    .title = Ne montri paĝojn po du
pdfjs-spread-none-button-label = Unupaĝa vido
pdfjs-spread-odd-button =
    .title = Kunigi paĝojn komencante per nepara paĝo
pdfjs-spread-odd-button-label = Po du paĝoj, neparaj maldekstre
pdfjs-spread-even-button =
    .title = Kunigi paĝojn komencante per para paĝo
pdfjs-spread-even-button-label = Po du paĝoj, paraj maldekstre

## Document properties dialog

pdfjs-document-properties-button =
    .title = Atributoj de dokumento…
pdfjs-document-properties-button-label = Atributoj de dokumento…
pdfjs-document-properties-file-name = Nomo de dosiero:
pdfjs-document-properties-file-size = Grando de dosiero:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KO ({ $size_b } oktetoj)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MO ({ $size_b } oktetoj)
pdfjs-document-properties-title = Titolo:
pdfjs-document-properties-author = Aŭtoro:
pdfjs-document-properties-subject = Temo:
pdfjs-document-properties-keywords = Ŝlosilvorto:
pdfjs-document-properties-creation-date = Dato de kreado:
pdfjs-document-properties-modification-date = Dato de modifo:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Kreinto:
pdfjs-document-properties-producer = Produktinto de PDF:
pdfjs-document-properties-version = Versio de PDF:
pdfjs-document-properties-page-count = Nombro de paĝoj:
pdfjs-document-properties-page-size = Grando de paĝo:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = vertikala
pdfjs-document-properties-page-size-orientation-landscape = horizontala
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Letera
pdfjs-document-properties-page-size-name-legal = Jura

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
pdfjs-document-properties-linearized = Rapida tekstaĵa vido:
pdfjs-document-properties-linearized-yes = Jes
pdfjs-document-properties-linearized-no = Ne
pdfjs-document-properties-close-button = Fermi

## Print

pdfjs-print-progress-message = Preparo de dokumento por presi ĝin …
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Nuligi
pdfjs-printing-not-supported = Averto: tiu ĉi retumilo ne plene subtenas presadon.
pdfjs-printing-not-ready = Averto: la PDF dosiero ne estas plene ŝargita por presado.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Montri/kaŝi flankan strion
pdfjs-toggle-sidebar-notification-button =
    .title = Montri/kaŝi flankan strion (la dokumento enhavas konturon/kunsendaĵojn/tavolojn)
pdfjs-toggle-sidebar-button-label = Montri/kaŝi flankan strion
pdfjs-document-outline-button =
    .title = Montri la konturon de dokumento (alklaku duoble por faldi/malfaldi ĉiujn elementojn)
pdfjs-document-outline-button-label = Konturo de dokumento
pdfjs-attachments-button =
    .title = Montri kunsendaĵojn
pdfjs-attachments-button-label = Kunsendaĵojn
pdfjs-layers-button =
    .title = Montri tavolojn (duoble alklaku por remeti ĉiujn tavolojn en la norman staton)
pdfjs-layers-button-label = Tavoloj
pdfjs-thumbs-button =
    .title = Montri miniaturojn
pdfjs-thumbs-button-label = Miniaturoj
pdfjs-current-outline-item-button =
    .title = Trovi nunan konturan elementon
pdfjs-current-outline-item-button-label = Nuna kontura elemento
pdfjs-findbar-button =
    .title = Serĉi en dokumento
pdfjs-findbar-button-label = Serĉi
pdfjs-additional-layers = Aldonaj tavoloj

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Paĝo { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniaturo de paĝo { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Serĉi
    .placeholder = Serĉi en dokumento…
pdfjs-find-previous-button =
    .title = Serĉi la antaŭan aperon de la frazo
pdfjs-find-previous-button-label = Malantaŭen
pdfjs-find-next-button =
    .title = Serĉi la venontan aperon de la frazo
pdfjs-find-next-button-label = Antaŭen
pdfjs-find-highlight-checkbox = Elstarigi ĉiujn
pdfjs-find-match-case-checkbox-label = Distingi inter majuskloj kaj minuskloj
pdfjs-find-match-diacritics-checkbox-label = Respekti supersignojn
pdfjs-find-entire-word-checkbox-label = Tutaj vortoj
pdfjs-find-reached-top = Komenco de la dokumento atingita, daŭrigado ekde la fino
pdfjs-find-reached-bottom = Fino de la dokumento atingita, daŭrigado ekde la komenco
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } el { $total } kongruo
       *[other] { $current } el { $total } kongruoj
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Pli ol { $limit } kongruo
       *[other] Pli ol { $limit } kongruoj
    }
pdfjs-find-not-found = Frazo ne trovita

## Predefined zoom values

pdfjs-page-scale-width = Larĝo de paĝo
pdfjs-page-scale-fit = Adapti paĝon
pdfjs-page-scale-auto = Aŭtomata skalo
pdfjs-page-scale-actual = Reala grando
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Paĝo { $page }

## Loading indicator messages

pdfjs-loading-error = Okazis eraro dum la ŝargado de la PDF dosiero.
pdfjs-invalid-file-error = Nevalida aŭ difektita PDF dosiero.
pdfjs-missing-file-error = Mankas dosiero PDF.
pdfjs-unexpected-response-error = Neatendita respondo de servilo.
pdfjs-rendering-error = Okazis eraro dum la montro de la paĝo.

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
    .alt = [Prinoto: { $type }]

## Password

pdfjs-password-label = Tajpu pasvorton por malfermi tiun ĉi dosieron PDF.
pdfjs-password-invalid = Nevalida pasvorto. Bonvolu provi denove.
pdfjs-password-ok-button = Akcepti
pdfjs-password-cancel-button = Nuligi
pdfjs-web-fonts-disabled = Neaktivaj teksaĵaj tiparoj: ne elbas uzi enmetitajn tiparojn de PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Teksto
pdfjs-editor-free-text-button-label = Teksto
pdfjs-editor-ink-button =
    .title = Desegni
pdfjs-editor-ink-button-label = Desegni
pdfjs-editor-stamp-button =
    .title = Aldoni aŭ modifi bildojn
pdfjs-editor-stamp-button-label = Aldoni aŭ modifi bildojn
pdfjs-editor-highlight-button =
    .title = Elstarigi
pdfjs-editor-highlight-button-label = Elstarigi
pdfjs-highlight-floating-button =
    .title = Elstarigi
pdfjs-highlight-floating-button1 =
    .title = Elstarigi
    .aria-label = Elstarigi
pdfjs-highlight-floating-button-label = Elstarigi

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Forigi desegnon
pdfjs-editor-remove-freetext-button =
    .title = Forigi tekston
pdfjs-editor-remove-stamp-button =
    .title = Forigi bildon
pdfjs-editor-remove-highlight-button =
    .title = Forigi elstaraĵon

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Koloro
pdfjs-editor-free-text-size-input = Grando
pdfjs-editor-ink-color-input = Koloro
pdfjs-editor-ink-thickness-input = Dikeco
pdfjs-editor-ink-opacity-input = Maldiafaneco
pdfjs-editor-stamp-add-image-button =
    .title = Aldoni bildon
pdfjs-editor-stamp-add-image-button-label = Aldoni bildon
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Dikeco
pdfjs-editor-free-highlight-thickness-title =
    .title = Ŝanĝi dikecon dum elstarigo de netekstaj elementoj
pdfjs-free-text =
    .aria-label = Tekstan redaktilon
pdfjs-free-text-default-content = Ektajpi…
pdfjs-ink =
    .aria-label = Desegnan redaktilon
pdfjs-ink-canvas =
    .aria-label = Bildo kreita de uzanto

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternativa teksto
pdfjs-editor-alt-text-edit-button-label = Redakti alternativan tekston
pdfjs-editor-alt-text-dialog-label = Elektu eblon
pdfjs-editor-alt-text-dialog-description = Alternativa teksto helpas personojn, en la okazoj kiam ili ne povas vidi aŭ ŝargi la bildon.
pdfjs-editor-alt-text-add-description-label = Aldoni priskribon
pdfjs-editor-alt-text-add-description-description = La celo estas unu aŭ du frazoj, kiuj priskribas la temon, etoson aŭ agojn.
pdfjs-editor-alt-text-mark-decorative-label = Marki kiel ornaman
pdfjs-editor-alt-text-mark-decorative-description = Tio ĉi estas uzita por ornamaj bildoj, kiel randoj aŭ fonaj bildoj.
pdfjs-editor-alt-text-cancel-button = Nuligi
pdfjs-editor-alt-text-save-button = Konservi
pdfjs-editor-alt-text-decorative-tooltip = Markita kiel ornama
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Ekzemple: “Juna persono sidiĝas ĉetable por ekmanĝi”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Supra maldekstra angulo — ŝangi grandon
pdfjs-editor-resizer-label-top-middle = Supra mezo — ŝanĝi grandon
pdfjs-editor-resizer-label-top-right = Supran dekstran angulon — ŝanĝi grandon
pdfjs-editor-resizer-label-middle-right = Dekstra mezo — ŝanĝi grandon
pdfjs-editor-resizer-label-bottom-right = Malsupra deksta angulo — ŝanĝi grandon
pdfjs-editor-resizer-label-bottom-middle = Malsupra mezo — ŝanĝi grandon
pdfjs-editor-resizer-label-bottom-left = Malsupra maldekstra angulo — ŝanĝi grandon
pdfjs-editor-resizer-label-middle-left = Maldekstra mezo — ŝanĝi grandon

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Elstarigi koloron
pdfjs-editor-colorpicker-button =
    .title = Ŝanĝi koloron
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Elekto de koloroj
pdfjs-editor-colorpicker-yellow =
    .title = Flava
pdfjs-editor-colorpicker-green =
    .title = Verda
pdfjs-editor-colorpicker-blue =
    .title = Blua
pdfjs-editor-colorpicker-pink =
    .title = Roza
pdfjs-editor-colorpicker-red =
    .title = Ruĝa

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Montri ĉiujn
pdfjs-editor-highlight-show-all-button =
    .title = Montri ĉiujn
