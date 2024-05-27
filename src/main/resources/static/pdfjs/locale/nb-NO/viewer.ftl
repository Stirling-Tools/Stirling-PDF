# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Forrige side
pdfjs-previous-button-label = Forrige
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
    .title = Bytt til presentasjonsmodus
pdfjs-presentation-mode-button-label = Presentasjonsmodus
pdfjs-open-file-button =
    .title = Åpne fil
pdfjs-open-file-button-label = Åpne
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
    .title = Gjeldende side (se URL fra gjeldende side)
pdfjs-bookmark-button-label = Gjeldende side

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
    .title = Roter med klokken
pdfjs-page-rotate-cw-button-label = Roter med klokken
pdfjs-page-rotate-ccw-button =
    .title = Roter mot klokken
pdfjs-page-rotate-ccw-button-label = Roter mot klokken
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
    .title = Bruk flersiderulling
pdfjs-scroll-wrapped-button-label = Flersiderulling
pdfjs-spread-none-button =
    .title = Vis enkeltsider
pdfjs-spread-none-button-label = Enkeltsider
pdfjs-spread-odd-button =
    .title = Vis oppslag med ulike sidenumre til venstre
pdfjs-spread-odd-button-label = Oppslag med forside
pdfjs-spread-even-button =
    .title = Vis oppslag med like sidenumre til venstre
pdfjs-spread-even-button-label = Oppslag uten forside

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumentegenskaper …
pdfjs-document-properties-button-label = Dokumentegenskaper …
pdfjs-document-properties-file-name = Filnavn:
pdfjs-document-properties-file-size = Filstørrelse:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Dokumentegenskaper …
pdfjs-document-properties-author = Forfatter:
pdfjs-document-properties-subject = Emne:
pdfjs-document-properties-keywords = Nøkkelord:
pdfjs-document-properties-creation-date = Opprettet dato:
pdfjs-document-properties-modification-date = Endret dato:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Opprettet av:
pdfjs-document-properties-producer = PDF-verktøy:
pdfjs-document-properties-version = PDF-versjon:
pdfjs-document-properties-page-count = Sideantall:
pdfjs-document-properties-page-size = Sidestørrelse:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = stående
pdfjs-document-properties-page-size-orientation-landscape = liggende
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
pdfjs-document-properties-linearized = Hurtig nettvisning:
pdfjs-document-properties-linearized-yes = Ja
pdfjs-document-properties-linearized-no = Nei
pdfjs-document-properties-close-button = Lukk

## Print

pdfjs-print-progress-message = Forbereder dokument for utskrift …
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Avbryt
pdfjs-printing-not-supported = Advarsel: Utskrift er ikke fullstendig støttet av denne nettleseren.
pdfjs-printing-not-ready = Advarsel: PDF er ikke fullstendig innlastet for utskrift.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Slå av/på sidestolpe
pdfjs-toggle-sidebar-notification-button =
    .title = Vis/gjem sidestolpe (dokumentet inneholder oversikt/vedlegg/lag)
pdfjs-toggle-sidebar-button-label = Slå av/på sidestolpe
pdfjs-document-outline-button =
    .title = Vis dokumentdisposisjonen (dobbeltklikk for å utvide/skjule alle elementer)
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
    .title = Finn gjeldende disposisjonselement
pdfjs-current-outline-item-button-label = Gjeldende disposisjonselement
pdfjs-findbar-button =
    .title = Finn i dokumentet
pdfjs-findbar-button-label = Finn
pdfjs-additional-layers = Ytterligere lag

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
    .title = Finn forrige forekomst av frasen
pdfjs-find-previous-button-label = Forrige
pdfjs-find-next-button =
    .title = Finn neste forekomst av frasen
pdfjs-find-next-button-label = Neste
pdfjs-find-highlight-checkbox = Uthev alle
pdfjs-find-match-case-checkbox-label = Skill store/små bokstaver
pdfjs-find-match-diacritics-checkbox-label = Samsvar diakritiske tegn
pdfjs-find-entire-word-checkbox-label = Hele ord
pdfjs-find-reached-top = Nådde toppen av dokumentet, fortsetter fra bunnen
pdfjs-find-reached-bottom = Nådde bunnen av dokumentet, fortsetter fra toppen
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
        [one] Mer enn { $limit } treff
       *[other] Mer enn { $limit } treff
    }
pdfjs-find-not-found = Fant ikke teksten

## Predefined zoom values

pdfjs-page-scale-width = Sidebredde
pdfjs-page-scale-fit = Tilpass til siden
pdfjs-page-scale-auto = Automatisk zoom
pdfjs-page-scale-actual = Virkelig størrelse
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale } %

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Side { $page }

## Loading indicator messages

pdfjs-loading-error = En feil oppstod ved lasting av PDF.
pdfjs-invalid-file-error = Ugyldig eller skadet PDF-fil.
pdfjs-missing-file-error = Manglende PDF-fil.
pdfjs-unexpected-response-error = Uventet serverrespons.
pdfjs-rendering-error = En feil oppstod ved opptegning av siden.

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
    .alt = [{ $type } annotasjon]

## Password

pdfjs-password-label = Skriv inn passordet for å åpne denne PDF-filen.
pdfjs-password-invalid = Ugyldig passord. Prøv igjen.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Avbryt
pdfjs-web-fonts-disabled = Web-fonter er avslått: Kan ikke bruke innbundne PDF-fonter.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-free-text-button-label = Tekst
pdfjs-editor-ink-button =
    .title = Tegn
pdfjs-editor-ink-button-label = Tegn
pdfjs-editor-stamp-button =
    .title = Legg til eller rediger bilder
pdfjs-editor-stamp-button-label = Legg til eller rediger bilder
pdfjs-editor-highlight-button =
    .title = Markere
pdfjs-editor-highlight-button-label = Markere
pdfjs-highlight-floating-button =
    .title = Markere
pdfjs-highlight-floating-button1 =
    .title = Markere
    .aria-label = Markere
pdfjs-highlight-floating-button-label = Markere

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Fjern tegningen
pdfjs-editor-remove-freetext-button =
    .title = Fjern tekst
pdfjs-editor-remove-stamp-button =
    .title = Fjern bildet
pdfjs-editor-remove-highlight-button =
    .title = Fjern utheving

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Farge
pdfjs-editor-free-text-size-input = Størrelse
pdfjs-editor-ink-color-input = Farge
pdfjs-editor-ink-thickness-input = Tykkelse
pdfjs-editor-ink-opacity-input = Ugjennomsiktighet
pdfjs-editor-stamp-add-image-button =
    .title = Legg til bilde
pdfjs-editor-stamp-add-image-button-label = Legg til bilde
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Tykkelse
pdfjs-editor-free-highlight-thickness-title =
    .title = Endre tykkelse når du markerer andre elementer enn tekst
pdfjs-free-text =
    .aria-label = Tekstredigering
pdfjs-free-text-default-content = Begynn å skrive…
pdfjs-ink =
    .aria-label = Tegneredigering
pdfjs-ink-canvas =
    .aria-label = Brukerskapt bilde

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alt-tekst
pdfjs-editor-alt-text-edit-button-label = Rediger alt-tekst tekst
pdfjs-editor-alt-text-dialog-label = Velg et alternativ
pdfjs-editor-alt-text-dialog-description = Alt-tekst (alternativ tekst) hjelper når folk ikke kan se bildet eller når det ikke lastes inn.
pdfjs-editor-alt-text-add-description-label = Legg til en beskrivelse
pdfjs-editor-alt-text-add-description-description = Gå etter 1-2 setninger som beskriver emnet, settingen eller handlingene.
pdfjs-editor-alt-text-mark-decorative-label = Merk som dekorativt
pdfjs-editor-alt-text-mark-decorative-description = Dette brukes til dekorative bilder, som kantlinjer eller vannmerker.
pdfjs-editor-alt-text-cancel-button = Avbryt
pdfjs-editor-alt-text-save-button = Lagre
pdfjs-editor-alt-text-decorative-tooltip = Merket som dekorativ
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = For eksempel, «En ung mann setter seg ved et bord for å spise et måltid»

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Øverste venstre hjørne – endre størrelse
pdfjs-editor-resizer-label-top-middle = Øverst i midten — endre størrelse
pdfjs-editor-resizer-label-top-right = Øverste høyre hjørne – endre størrelse
pdfjs-editor-resizer-label-middle-right = Midt til høyre – endre størrelse
pdfjs-editor-resizer-label-bottom-right = Nederste høyre hjørne – endre størrelse
pdfjs-editor-resizer-label-bottom-middle = Nederst i midten — endre størrelse
pdfjs-editor-resizer-label-bottom-left = Nederste venstre hjørne – endre størrelse
pdfjs-editor-resizer-label-middle-left = Midt til venstre — endre størrelse

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Uthevingsfarge
pdfjs-editor-colorpicker-button =
    .title = Endre farge
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Fargevalg
pdfjs-editor-colorpicker-yellow =
    .title = Gul
pdfjs-editor-colorpicker-green =
    .title = Grønn
pdfjs-editor-colorpicker-blue =
    .title = Blå
pdfjs-editor-colorpicker-pink =
    .title = Rosa
pdfjs-editor-colorpicker-red =
    .title = Rød

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Vis alle
pdfjs-editor-highlight-show-all-button =
    .title = Vis alle
