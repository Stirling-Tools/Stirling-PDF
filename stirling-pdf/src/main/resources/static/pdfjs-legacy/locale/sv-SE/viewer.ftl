# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Föregående sida
pdfjs-previous-button-label = Föregående
pdfjs-next-button =
    .title = Nästa sida
pdfjs-next-button-label = Nästa
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Sida
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = av { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } av { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zooma ut
pdfjs-zoom-out-button-label = Zooma ut
pdfjs-zoom-in-button =
    .title = Zooma in
pdfjs-zoom-in-button-label = Zooma in
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Byt till presentationsläge
pdfjs-presentation-mode-button-label = Presentationsläge
pdfjs-open-file-button =
    .title = Öppna fil
pdfjs-open-file-button-label = Öppna
pdfjs-print-button =
    .title = Skriv ut
pdfjs-print-button-label = Skriv ut
pdfjs-save-button =
    .title = Spara
pdfjs-save-button-label = Spara
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Hämta
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Hämta
pdfjs-bookmark-button =
    .title = Aktuell sida (Visa URL från aktuell sida)
pdfjs-bookmark-button-label = Aktuell sida
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Öppna i app
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Öppna i app

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Verktyg
pdfjs-tools-button-label = Verktyg
pdfjs-first-page-button =
    .title = Gå till första sidan
pdfjs-first-page-button-label = Gå till första sidan
pdfjs-last-page-button =
    .title = Gå till sista sidan
pdfjs-last-page-button-label = Gå till sista sidan
pdfjs-page-rotate-cw-button =
    .title = Rotera medurs
pdfjs-page-rotate-cw-button-label = Rotera medurs
pdfjs-page-rotate-ccw-button =
    .title = Rotera moturs
pdfjs-page-rotate-ccw-button-label = Rotera moturs
pdfjs-cursor-text-select-tool-button =
    .title = Aktivera textmarkeringsverktyg
pdfjs-cursor-text-select-tool-button-label = Textmarkeringsverktyg
pdfjs-cursor-hand-tool-button =
    .title = Aktivera handverktyg
pdfjs-cursor-hand-tool-button-label = Handverktyg
pdfjs-scroll-page-button =
    .title = Använd sidrullning
pdfjs-scroll-page-button-label = Sidrullning
pdfjs-scroll-vertical-button =
    .title = Använd vertikal rullning
pdfjs-scroll-vertical-button-label = Vertikal rullning
pdfjs-scroll-horizontal-button =
    .title = Använd horisontell rullning
pdfjs-scroll-horizontal-button-label = Horisontell rullning
pdfjs-scroll-wrapped-button =
    .title = Använd överlappande rullning
pdfjs-scroll-wrapped-button-label = Överlappande rullning
pdfjs-spread-none-button =
    .title = Visa enkelsidor
pdfjs-spread-none-button-label = Enkelsidor
pdfjs-spread-odd-button =
    .title = Visa uppslag med olika sidnummer till vänster
pdfjs-spread-odd-button-label = Uppslag med framsida
pdfjs-spread-even-button =
    .title = Visa uppslag med lika sidnummer till vänster
pdfjs-spread-even-button-label = Uppslag utan framsida

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumentegenskaper…
pdfjs-document-properties-button-label = Dokumentegenskaper…
pdfjs-document-properties-file-name = Filnamn:
pdfjs-document-properties-file-size = Filstorlek:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } kB ({ $size_b } byte)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } byte)
pdfjs-document-properties-title = Titel:
pdfjs-document-properties-author = Författare:
pdfjs-document-properties-subject = Ämne:
pdfjs-document-properties-keywords = Nyckelord:
pdfjs-document-properties-creation-date = Skapades:
pdfjs-document-properties-modification-date = Ändrades:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Skapare:
pdfjs-document-properties-producer = PDF-producent:
pdfjs-document-properties-version = PDF-version:
pdfjs-document-properties-page-count = Sidantal:
pdfjs-document-properties-page-size = Pappersstorlek:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = porträtt
pdfjs-document-properties-page-size-orientation-landscape = landskap
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
pdfjs-document-properties-linearized = Snabb webbvisning:
pdfjs-document-properties-linearized-yes = Ja
pdfjs-document-properties-linearized-no = Nej
pdfjs-document-properties-close-button = Stäng

## Print

pdfjs-print-progress-message = Förbereder sidor för utskrift…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Avbryt
pdfjs-printing-not-supported = Varning: Utskrifter stöds inte helt av den här webbläsaren.
pdfjs-printing-not-ready = Varning: PDF:en är inte klar för utskrift.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Visa/dölj sidofält
pdfjs-toggle-sidebar-notification-button =
    .title = Växla sidofält (dokumentet innehåller dokumentstruktur/bilagor/lager)
pdfjs-toggle-sidebar-button-label = Visa/dölj sidofält
pdfjs-document-outline-button =
    .title = Visa dokumentdisposition (dubbelklicka för att expandera/komprimera alla objekt)
pdfjs-document-outline-button-label = Dokumentöversikt
pdfjs-attachments-button =
    .title = Visa Bilagor
pdfjs-attachments-button-label = Bilagor
pdfjs-layers-button =
    .title = Visa lager (dubbelklicka för att återställa alla lager till standardläge)
pdfjs-layers-button-label = Lager
pdfjs-thumbs-button =
    .title = Visa miniatyrer
pdfjs-thumbs-button-label = Miniatyrer
pdfjs-current-outline-item-button =
    .title = Hitta aktuellt dispositionsobjekt
pdfjs-current-outline-item-button-label = Aktuellt dispositionsobjekt
pdfjs-findbar-button =
    .title = Sök i dokument
pdfjs-findbar-button-label = Sök
pdfjs-additional-layers = Ytterligare lager

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Sida { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatyr av sida { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Sök
    .placeholder = Sök i dokument…
pdfjs-find-previous-button =
    .title = Hitta föregående förekomst av frasen
pdfjs-find-previous-button-label = Föregående
pdfjs-find-next-button =
    .title = Hitta nästa förekomst av frasen
pdfjs-find-next-button-label = Nästa
pdfjs-find-highlight-checkbox = Markera alla
pdfjs-find-match-case-checkbox-label = Matcha versal/gemen
pdfjs-find-match-diacritics-checkbox-label = Matcha diakritiska tecken
pdfjs-find-entire-word-checkbox-label = Hela ord
pdfjs-find-reached-top = Nådde början av dokumentet, började från slutet
pdfjs-find-reached-bottom = Nådde slutet på dokumentet, började från början
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } av { $total } match
       *[other] { $current } av { $total } matchningar
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Mer än { $limit } matchning
       *[other] Fler än { $limit } matchningar
    }
pdfjs-find-not-found = Frasen hittades inte

## Predefined zoom values

pdfjs-page-scale-width = Sidbredd
pdfjs-page-scale-fit = Anpassa sida
pdfjs-page-scale-auto = Automatisk zoom
pdfjs-page-scale-actual = Verklig storlek
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Sida { $page }

## Loading indicator messages

pdfjs-loading-error = Ett fel uppstod vid laddning av PDF-filen.
pdfjs-invalid-file-error = Ogiltig eller korrupt PDF-fil.
pdfjs-missing-file-error = Saknad PDF-fil.
pdfjs-unexpected-response-error = Oväntat svar från servern.
pdfjs-rendering-error = Ett fel uppstod vid visning av sidan.

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
    .alt = [{ $type }-annotering]

## Password

pdfjs-password-label = Skriv in lösenordet för att öppna PDF-filen.
pdfjs-password-invalid = Ogiltigt lösenord. Försök igen.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Avbryt
pdfjs-web-fonts-disabled = Webbtypsnitt är inaktiverade: kan inte använda inbäddade PDF-typsnitt.

## Editing

pdfjs-editor-free-text-button =
    .title = Text
pdfjs-editor-free-text-button-label = Text
pdfjs-editor-ink-button =
    .title = Rita
pdfjs-editor-ink-button-label = Rita
pdfjs-editor-stamp-button =
    .title = Lägg till eller redigera bilder
pdfjs-editor-stamp-button-label = Lägg till eller redigera bilder
pdfjs-editor-highlight-button =
    .title = Markera
pdfjs-editor-highlight-button-label = Markera
pdfjs-highlight-floating-button =
    .title = Markera
pdfjs-highlight-floating-button1 =
    .title = Markera
    .aria-label = Markera
pdfjs-highlight-floating-button-label = Markera

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Ta bort ritning
pdfjs-editor-remove-freetext-button =
    .title = Ta bort text
pdfjs-editor-remove-stamp-button =
    .title = Ta bort bild
pdfjs-editor-remove-highlight-button =
    .title = Ta bort markering

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Färg
pdfjs-editor-free-text-size-input = Storlek
pdfjs-editor-ink-color-input = Färg
pdfjs-editor-ink-thickness-input = Tjocklek
pdfjs-editor-ink-opacity-input = Opacitet
pdfjs-editor-stamp-add-image-button =
    .title = Lägg till bild
pdfjs-editor-stamp-add-image-button-label = Lägg till bild
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Tjocklek
pdfjs-editor-free-highlight-thickness-title =
    .title = Ändra tjocklek när du markerar andra objekt än text
pdfjs-free-text =
    .aria-label = Textredigerare
pdfjs-free-text-default-content = Börja skriva…
pdfjs-ink =
    .aria-label = Ritredigerare
pdfjs-ink-canvas =
    .aria-label = Användarskapad bild

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternativ text
pdfjs-editor-alt-text-edit-button-label = Redigera alternativ text
pdfjs-editor-alt-text-dialog-label = Välj ett alternativ
pdfjs-editor-alt-text-dialog-description = Alt text (alternativ text) hjälper till när människor inte kan se bilden eller när den inte laddas.
pdfjs-editor-alt-text-add-description-label = Lägg till en beskrivning
pdfjs-editor-alt-text-add-description-description = Sikta på 1-2 meningar som beskriver ämnet, miljön eller handlingen.
pdfjs-editor-alt-text-mark-decorative-label = Markera som dekorativ
pdfjs-editor-alt-text-mark-decorative-description = Detta används för dekorativa bilder, som kanter eller vattenstämplar.
pdfjs-editor-alt-text-cancel-button = Avbryt
pdfjs-editor-alt-text-save-button = Spara
pdfjs-editor-alt-text-decorative-tooltip = Märkt som dekorativ
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Till exempel, "En ung man sätter sig vid ett bord för att äta en måltid"

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Det övre vänstra hörnet — ändra storlek
pdfjs-editor-resizer-label-top-middle = Överst i mitten — ändra storlek
pdfjs-editor-resizer-label-top-right = Det övre högra hörnet — ändra storlek
pdfjs-editor-resizer-label-middle-right = Mitten höger — ändra storlek
pdfjs-editor-resizer-label-bottom-right = Nedre högra hörnet — ändra storlek
pdfjs-editor-resizer-label-bottom-middle = Nedre mitten — ändra storlek
pdfjs-editor-resizer-label-bottom-left = Nedre vänstra hörnet — ändra storlek
pdfjs-editor-resizer-label-middle-left = Mitten till vänster — ändra storlek

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Markeringsfärg
pdfjs-editor-colorpicker-button =
    .title = Ändra färg
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Färgval
pdfjs-editor-colorpicker-yellow =
    .title = Gul
pdfjs-editor-colorpicker-green =
    .title = Grön
pdfjs-editor-colorpicker-blue =
    .title = Blå
pdfjs-editor-colorpicker-pink =
    .title = Rosa
pdfjs-editor-colorpicker-red =
    .title = Röd

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Visa alla
pdfjs-editor-highlight-show-all-button =
    .title = Visa alla
