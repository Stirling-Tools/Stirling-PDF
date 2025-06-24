# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Føregåande side
pdfjs-previous-button-label = Føregåande
pdfjs-next-button =
    .title = Neste side
pdfjs-next-button-label = Neste
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Side
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = av { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } av { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zoom ut
pdfjs-zoom-out-button-label = Zoom ut
pdfjs-zoom-in-button =
    .title = Zoom inn
pdfjs-zoom-in-button-label = Zoom inn
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Byt til presentasjonsmodus
pdfjs-presentation-mode-button-label = Presentasjonsmodus
pdfjs-open-file-button =
    .title = Opne fil
pdfjs-open-file-button-label = Opne
pdfjs-print-button =
    .title = Skriv ut
pdfjs-print-button-label = Skriv ut
pdfjs-save-button =
    .title = Lagre
pdfjs-save-button-label = Lagre
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Last ned
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Last ned
pdfjs-bookmark-button =
    .title = Gjeldande side (sjå URL frå gjeldande side)
pdfjs-bookmark-button-label = Gjeldande side
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Opne i app
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Opne i app

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Verktøy
pdfjs-tools-button-label = Verktøy
pdfjs-first-page-button =
    .title = Gå til første side
pdfjs-first-page-button-label = Gå til første side
pdfjs-last-page-button =
    .title = Gå til siste side
pdfjs-last-page-button-label = Gå til siste side
pdfjs-page-rotate-cw-button =
    .title = Roter med klokka
pdfjs-page-rotate-cw-button-label = Roter med klokka
pdfjs-page-rotate-ccw-button =
    .title = Roter mot klokka
pdfjs-page-rotate-ccw-button-label = Roter mot klokka
pdfjs-cursor-text-select-tool-button =
    .title = Aktiver tekstmarkeringsverktøy
pdfjs-cursor-text-select-tool-button-label = Tekstmarkeringsverktøy
pdfjs-cursor-hand-tool-button =
    .title = Aktiver handverktøy
pdfjs-cursor-hand-tool-button-label = Handverktøy
pdfjs-scroll-page-button =
    .title = Bruk siderulling
pdfjs-scroll-page-button-label = Siderulling
pdfjs-scroll-vertical-button =
    .title = Bruk vertikal rulling
pdfjs-scroll-vertical-button-label = Vertikal rulling
pdfjs-scroll-horizontal-button =
    .title = Bruk horisontal rulling
pdfjs-scroll-horizontal-button-label = Horisontal rulling
pdfjs-scroll-wrapped-button =
    .title = Bruk fleirsiderulling
pdfjs-scroll-wrapped-button-label = Fleirsiderulling
pdfjs-spread-none-button =
    .title = Vis enkeltsider
pdfjs-spread-none-button-label = Enkeltside
pdfjs-spread-odd-button =
    .title = Vis oppslag med ulike sidenummer til venstre
pdfjs-spread-odd-button-label = Oppslag med framside
pdfjs-spread-even-button =
    .title = Vis oppslag med like sidenummmer til venstre
pdfjs-spread-even-button-label = Oppslag utan framside

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumenteigenskapar…
pdfjs-document-properties-button-label = Dokumenteigenskapar…
pdfjs-document-properties-file-name = Filnamn:
pdfjs-document-properties-file-size = Filstorleik:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Tittel:
pdfjs-document-properties-author = Forfattar:
pdfjs-document-properties-subject = Emne:
pdfjs-document-properties-keywords = Stikkord:
pdfjs-document-properties-creation-date = Dato oppretta:
pdfjs-document-properties-modification-date = Dato endra:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Oppretta av:
pdfjs-document-properties-producer = PDF-verktøy:
pdfjs-document-properties-version = PDF-versjon:
pdfjs-document-properties-page-count = Sidetal:
pdfjs-document-properties-page-size = Sidestørrelse:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = ståande
pdfjs-document-properties-page-size-orientation-landscape = liggande
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Brev
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
pdfjs-document-properties-linearized = Rask nettvising:
pdfjs-document-properties-linearized-yes = Ja
pdfjs-document-properties-linearized-no = Nei
pdfjs-document-properties-close-button = Lat att

## Print

pdfjs-print-progress-message = Førebur dokumentet for utskrift…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Avbryt
pdfjs-printing-not-supported = Åtvaring: Utskrift er ikkje fullstendig støtta av denne nettlesaren.
pdfjs-printing-not-ready = Åtvaring: PDF ikkje fullstendig innlasta for utskrift.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Slå av/på sidestolpe
pdfjs-toggle-sidebar-notification-button =
    .title = Vis/gøym sidestolpe (dokumentet inneheld oversikt/vedlegg/lag)
pdfjs-toggle-sidebar-button-label = Slå av/på sidestolpe
pdfjs-document-outline-button =
    .title = Vis dokumentdisposisjonen (dobbelklikk for å utvide/gøyme alle elementa)
pdfjs-document-outline-button-label = Dokumentdisposisjon
pdfjs-attachments-button =
    .title = Vis vedlegg
pdfjs-attachments-button-label = Vedlegg
pdfjs-layers-button =
    .title = Vis lag (dobbeltklikk for å tilbakestille alle lag til standardtilstand)
pdfjs-layers-button-label = Lag
pdfjs-thumbs-button =
    .title = Vis miniatyrbilde
pdfjs-thumbs-button-label = Miniatyrbilde
pdfjs-current-outline-item-button =
    .title = Finn gjeldande disposisjonselement
pdfjs-current-outline-item-button-label = Gjeldande disposisjonselement
pdfjs-findbar-button =
    .title = Finn i dokumentet
pdfjs-findbar-button-label = Finn
pdfjs-additional-layers = Ytterlegare lag

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Side { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatyrbilde av side { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Søk
    .placeholder = Søk i dokument…
pdfjs-find-previous-button =
    .title = Finn førre førekomst av frasen
pdfjs-find-previous-button-label = Førre
pdfjs-find-next-button =
    .title = Finn neste førekomst av frasen
pdfjs-find-next-button-label = Neste
pdfjs-find-highlight-checkbox = Uthev alle
pdfjs-find-match-case-checkbox-label = Skil store/små bokstavar
pdfjs-find-match-diacritics-checkbox-label = Samsvar diakritiske teikn
pdfjs-find-entire-word-checkbox-label = Heile ord
pdfjs-find-reached-top = Nådde toppen av dokumentet, fortset frå botnen
pdfjs-find-reached-bottom = Nådde botnen av dokumentet, fortset frå toppen
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } av { $total } treff
       *[other] { $current } av { $total } treff
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Meir enn { $limit } treff
       *[other] Meir enn { $limit } treff
    }
pdfjs-find-not-found = Fann ikkje teksten

## Predefined zoom values

pdfjs-page-scale-width = Sidebreidde
pdfjs-page-scale-fit = Tilpass til sida
pdfjs-page-scale-auto = Automatisk skalering
pdfjs-page-scale-actual = Verkeleg storleik
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Side { $page }

## Loading indicator messages

pdfjs-loading-error = Ein feil oppstod ved lasting av PDF.
pdfjs-invalid-file-error = Ugyldig eller korrupt PDF-fil.
pdfjs-missing-file-error = Manglande PDF-fil.
pdfjs-unexpected-response-error = Uventa tenarrespons.
pdfjs-rendering-error = Ein feil oppstod under vising av sida.

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date } { $time }
# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } annotasjon]

## Password

pdfjs-password-label = Skriv inn passordet for å opne denne PDF-fila.
pdfjs-password-invalid = Ugyldig passord. Prøv på nytt.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Avbryt
pdfjs-web-fonts-disabled = Web-skrifter er slått av: Kan ikkje bruke innbundne PDF-skrifter.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-free-text-button-label = Tekst
pdfjs-editor-ink-button =
    .title = Teikne
pdfjs-editor-ink-button-label = Teikne
pdfjs-editor-stamp-button =
    .title = Legg til eller rediger bilde
pdfjs-editor-stamp-button-label = Legg til eller rediger bilde

## Remove button for the various kind of editor.


##

# Editor Parameters
pdfjs-editor-free-text-color-input = Farge
pdfjs-editor-free-text-size-input = Storleik
pdfjs-editor-ink-color-input = Farge
pdfjs-editor-ink-thickness-input = Tjukkleik
pdfjs-editor-ink-opacity-input = Ugjennomskinleg
pdfjs-editor-stamp-add-image-button =
    .title = Legg til bilde
pdfjs-editor-stamp-add-image-button-label = Legg til bilde
pdfjs-free-text =
    .aria-label = Tekstredigering
pdfjs-free-text-default-content = Byrje å skrive…
pdfjs-ink =
    .aria-label = Teikneredigering
pdfjs-ink-canvas =
    .aria-label = Brukarskapt bilde

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alt-tekst
pdfjs-editor-alt-text-edit-button-label = Rediger alt-tekst tekst
pdfjs-editor-alt-text-dialog-label = Vel eit alternativ
pdfjs-editor-alt-text-dialog-description = Alt-tekst (alternativ tekst) hjelper når folk ikkje kan sjå bildet eller når det ikkje vert lasta inn.
pdfjs-editor-alt-text-add-description-label = Legg til ei skildring
pdfjs-editor-alt-text-add-description-description = Gå etter 1-2 setninger som skildrar emnet, settinga eller handlingane.
pdfjs-editor-alt-text-mark-decorative-label = Merk som dekorativt
pdfjs-editor-alt-text-mark-decorative-description = Dette vert brukt til dekorative bilde, som kantlinjer eller vassmerke.
pdfjs-editor-alt-text-cancel-button = Avbryt
pdfjs-editor-alt-text-save-button = Lagre
pdfjs-editor-alt-text-decorative-tooltip = Merkt som dekorativ
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Til dømes, «Ein ung mann set seg ved eit bord for å ete eit måltid»

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.


## Color picker

pdfjs-editor-colorpicker-yellow =
    .title = Gul
pdfjs-editor-colorpicker-green =
    .title = Grøn
pdfjs-editor-colorpicker-blue =
    .title = Blå
pdfjs-editor-colorpicker-pink =
    .title = Rosa
pdfjs-editor-colorpicker-red =
    .title = Raud
