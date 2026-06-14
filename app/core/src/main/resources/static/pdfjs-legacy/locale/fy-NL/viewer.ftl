# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Foarige side
pdfjs-previous-button-label = Foarige
pdfjs-next-button =
    .title = Folgjende side
pdfjs-next-button-label = Folgjende
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Side
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = fan { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } fan { $pagesCount })
pdfjs-zoom-out-button =
    .title = Utzoome
pdfjs-zoom-out-button-label = Utzoome
pdfjs-zoom-in-button =
    .title = Ynzoome
pdfjs-zoom-in-button-label = Ynzoome
pdfjs-zoom-select =
    .title = Zoome
pdfjs-presentation-mode-button =
    .title = Wikselje nei presintaasjemodus
pdfjs-presentation-mode-button-label = Presintaasjemodus
pdfjs-open-file-button =
    .title = Bestân iepenje
pdfjs-open-file-button-label = Iepenje
pdfjs-print-button =
    .title = Ofdrukke
pdfjs-print-button-label = Ofdrukke
pdfjs-save-button =
    .title = Bewarje
pdfjs-save-button-label = Bewarje
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Downloade
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Downloade
pdfjs-bookmark-button =
    .title = Aktuele side (URL fan aktuele side besjen)
pdfjs-bookmark-button-label = Aktuele side
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Iepenje yn app
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Iepenje yn app

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Ark
pdfjs-tools-button-label = Ark
pdfjs-first-page-button =
    .title = Gean nei earste side
pdfjs-first-page-button-label = Gean nei earste side
pdfjs-last-page-button =
    .title = Gean nei lêste side
pdfjs-last-page-button-label = Gean nei lêste side
pdfjs-page-rotate-cw-button =
    .title = Rjochtsom draaie
pdfjs-page-rotate-cw-button-label = Rjochtsom draaie
pdfjs-page-rotate-ccw-button =
    .title = Linksom draaie
pdfjs-page-rotate-ccw-button-label = Linksom draaie
pdfjs-cursor-text-select-tool-button =
    .title = Tekstseleksjehelpmiddel ynskeakelje
pdfjs-cursor-text-select-tool-button-label = Tekstseleksjehelpmiddel
pdfjs-cursor-hand-tool-button =
    .title = Hânhelpmiddel ynskeakelje
pdfjs-cursor-hand-tool-button-label = Hânhelpmiddel
pdfjs-scroll-page-button =
    .title = Sideskowen brûke
pdfjs-scroll-page-button-label = Sideskowen
pdfjs-scroll-vertical-button =
    .title = Fertikaal skowe brûke
pdfjs-scroll-vertical-button-label = Fertikaal skowe
pdfjs-scroll-horizontal-button =
    .title = Horizontaal skowe brûke
pdfjs-scroll-horizontal-button-label = Horizontaal skowe
pdfjs-scroll-wrapped-button =
    .title = Skowe mei oersjoch brûke
pdfjs-scroll-wrapped-button-label = Skowe mei oersjoch
pdfjs-spread-none-button =
    .title = Sidesprieding net gearfetsje
pdfjs-spread-none-button-label = Gjin sprieding
pdfjs-spread-odd-button =
    .title = Sidesprieding gearfetsje te starten mei ûneven nûmers
pdfjs-spread-odd-button-label = Uneven sprieding
pdfjs-spread-even-button =
    .title = Sidesprieding gearfetsje te starten mei even nûmers
pdfjs-spread-even-button-label = Even sprieding

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokuminteigenskippen…
pdfjs-document-properties-button-label = Dokuminteigenskippen…
pdfjs-document-properties-file-name = Bestânsnamme:
pdfjs-document-properties-file-size = Bestânsgrutte:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Titel:
pdfjs-document-properties-author = Auteur:
pdfjs-document-properties-subject = Underwerp:
pdfjs-document-properties-keywords = Kaaiwurden:
pdfjs-document-properties-creation-date = Oanmaakdatum:
pdfjs-document-properties-modification-date = Bewurkingsdatum:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Makker:
pdfjs-document-properties-producer = PDF-makker:
pdfjs-document-properties-version = PDF-ferzje:
pdfjs-document-properties-page-count = Siden:
pdfjs-document-properties-page-size = Sideformaat:
pdfjs-document-properties-page-size-unit-inches = yn
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = steand
pdfjs-document-properties-page-size-orientation-landscape = lizzend
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Letter
pdfjs-document-properties-page-size-name-legal = Juridysk

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
pdfjs-document-properties-linearized = Flugge webwerjefte:
pdfjs-document-properties-linearized-yes = Ja
pdfjs-document-properties-linearized-no = Nee
pdfjs-document-properties-close-button = Slute

## Print

pdfjs-print-progress-message = Dokumint tariede oar ôfdrukken…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Annulearje
pdfjs-printing-not-supported = Warning: Printen is net folslein stipe troch dizze browser.
pdfjs-printing-not-ready = Warning: PDF is net folslein laden om ôf te drukken.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Sidebalke yn-/útskeakelje
pdfjs-toggle-sidebar-notification-button =
    .title = Sidebalke yn-/útskeakelje (dokumint befettet oersjoch/bylagen/lagen)
pdfjs-toggle-sidebar-button-label = Sidebalke yn-/útskeakelje
pdfjs-document-outline-button =
    .title = Dokumintoersjoch toane (dûbelklik om alle items út/yn te klappen)
pdfjs-document-outline-button-label = Dokumintoersjoch
pdfjs-attachments-button =
    .title = Bylagen toane
pdfjs-attachments-button-label = Bylagen
pdfjs-layers-button =
    .title = Lagen toane (dûbelklik om alle lagen nei de standertsteat werom te setten)
pdfjs-layers-button-label = Lagen
pdfjs-thumbs-button =
    .title = Foarbylden toane
pdfjs-thumbs-button-label = Foarbylden
pdfjs-current-outline-item-button =
    .title = Aktueel item yn ynhâldsopjefte sykje
pdfjs-current-outline-item-button-label = Aktueel item yn ynhâldsopjefte
pdfjs-findbar-button =
    .title = Sykje yn dokumint
pdfjs-findbar-button-label = Sykje
pdfjs-additional-layers = Oanfoljende lagen

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Side { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Foarbyld fan side { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Sykje
    .placeholder = Sykje yn dokumint…
pdfjs-find-previous-button =
    .title = It foarige foarkommen fan de tekst sykje
pdfjs-find-previous-button-label = Foarige
pdfjs-find-next-button =
    .title = It folgjende foarkommen fan de tekst sykje
pdfjs-find-next-button-label = Folgjende
pdfjs-find-highlight-checkbox = Alles markearje
pdfjs-find-match-case-checkbox-label = Haadlettergefoelich
pdfjs-find-match-diacritics-checkbox-label = Diakrityske tekens brûke
pdfjs-find-entire-word-checkbox-label = Hiele wurden
pdfjs-find-reached-top = Boppekant fan dokumint berikt, trochgien fan ûnder ôf
pdfjs-find-reached-bottom = Ein fan dokumint berikt, trochgien fan boppe ôf
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } fan { $total } oerienkomst
       *[other] { $current } fan { $total } oerienkomsten
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Mear as { $limit } oerienkomst
       *[other] Mear as { $limit } oerienkomsten
    }
pdfjs-find-not-found = Tekst net fûn

## Predefined zoom values

pdfjs-page-scale-width = Sidebreedte
pdfjs-page-scale-fit = Hiele side
pdfjs-page-scale-auto = Automatysk zoome
pdfjs-page-scale-actual = Werklike grutte
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Side { $page }

## Loading indicator messages

pdfjs-loading-error = Der is in flater bard by it laden fan de PDF.
pdfjs-invalid-file-error = Ynfalide of korruptearre PDF-bestân.
pdfjs-missing-file-error = PDF-bestân ûntbrekt.
pdfjs-unexpected-response-error = Unferwacht serverantwurd.
pdfjs-rendering-error = Der is in flater bard by it renderjen fan de side.

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
    .alt = [{ $type }-annotaasje]

## Password

pdfjs-password-label = Jou it wachtwurd om dit PDF-bestân te iepenjen.
pdfjs-password-invalid = Ferkeard wachtwurd. Probearje opnij.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Annulearje
pdfjs-web-fonts-disabled = Weblettertypen binne útskeakele: gebrûk fan ynsluten PDF-lettertypen is net mooglik.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-free-text-button-label = Tekst
pdfjs-editor-ink-button =
    .title = Tekenje
pdfjs-editor-ink-button-label = Tekenje
pdfjs-editor-stamp-button =
    .title = Ofbyldingen tafoegje of bewurkje
pdfjs-editor-stamp-button-label = Ofbyldingen tafoegje of bewurkje
pdfjs-editor-highlight-button =
    .title = Markearje
pdfjs-editor-highlight-button-label = Markearje
pdfjs-highlight-floating-button =
    .title = Markearje
pdfjs-highlight-floating-button1 =
    .title = Markearje
    .aria-label = Markearje
pdfjs-highlight-floating-button-label = Markearje

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Tekening fuortsmite
pdfjs-editor-remove-freetext-button =
    .title = Tekst fuortsmite
pdfjs-editor-remove-stamp-button =
    .title = Ofbylding fuortsmite
pdfjs-editor-remove-highlight-button =
    .title = Markearring fuortsmite

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Kleur
pdfjs-editor-free-text-size-input = Grutte
pdfjs-editor-ink-color-input = Kleur
pdfjs-editor-ink-thickness-input = Tsjokte
pdfjs-editor-ink-opacity-input = Transparânsje
pdfjs-editor-stamp-add-image-button =
    .title = Ofbylding tafoegje
pdfjs-editor-stamp-add-image-button-label = Ofbylding tafoegje
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Tsjokte
pdfjs-editor-free-highlight-thickness-title =
    .title = Tsjokte wizigje by aksintuearring fan oare items as tekst
pdfjs-free-text =
    .aria-label = Tekstbewurker
pdfjs-free-text-default-content = Begjin mei typen…
pdfjs-ink =
    .aria-label = Tekeningbewurker
pdfjs-ink-canvas =
    .aria-label = Troch brûker makke ôfbylding

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternative tekst
pdfjs-editor-alt-text-edit-button-label = Alternative tekst bewurkje
pdfjs-editor-alt-text-dialog-label = Kies in opsje
pdfjs-editor-alt-text-dialog-description = Alternative tekst helpt wannear’t minsken de ôfbylding net sjen kinne of wannear’t dizze net laden wurdt.
pdfjs-editor-alt-text-add-description-label = Foegje in beskriuwing ta
pdfjs-editor-alt-text-add-description-description = Stribje nei 1-2 sinnen dy’t it ûnderwerp, de omjouwing of de aksjes beskriuwe.
pdfjs-editor-alt-text-mark-decorative-label = As dekoratyf markearje
pdfjs-editor-alt-text-mark-decorative-description = Dit wurdt brûkt foar sierlike ôfbyldingen, lykas rânen of wettermerken.
pdfjs-editor-alt-text-cancel-button = Annulearje
pdfjs-editor-alt-text-save-button = Bewarje
pdfjs-editor-alt-text-decorative-tooltip = As dekoratyf markearre
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Bygelyks, ‘In jonge man sit oan in tafel om te iten’

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Linkerboppehoek – formaat wizigje
pdfjs-editor-resizer-label-top-middle = Midden boppe – formaat wizigje
pdfjs-editor-resizer-label-top-right = Rjochterboppehoek – formaat wizigje
pdfjs-editor-resizer-label-middle-right = Midden rjochts – formaat wizigje
pdfjs-editor-resizer-label-bottom-right = Rjochterûnderhoek – formaat wizigje
pdfjs-editor-resizer-label-bottom-middle = Midden ûnder – formaat wizigje
pdfjs-editor-resizer-label-bottom-left = Linkerûnderhoek – formaat wizigje
pdfjs-editor-resizer-label-middle-left = Links midden – formaat wizigje

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Markearringskleur
pdfjs-editor-colorpicker-button =
    .title = Kleur wizigje
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Kleurkarren
pdfjs-editor-colorpicker-yellow =
    .title = Giel
pdfjs-editor-colorpicker-green =
    .title = Grien
pdfjs-editor-colorpicker-blue =
    .title = Blau
pdfjs-editor-colorpicker-pink =
    .title = Roze
pdfjs-editor-colorpicker-red =
    .title = Read

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Alles toane
pdfjs-editor-highlight-show-all-button =
    .title = Alles toane
