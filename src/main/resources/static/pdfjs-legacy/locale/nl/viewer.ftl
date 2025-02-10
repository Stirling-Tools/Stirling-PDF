# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Vorige pagina
pdfjs-previous-button-label = Vorige
pdfjs-next-button =
    .title = Volgende pagina
pdfjs-next-button-label = Volgende
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pagina
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = van { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } van { $pagesCount })
pdfjs-zoom-out-button =
    .title = Uitzoomen
pdfjs-zoom-out-button-label = Uitzoomen
pdfjs-zoom-in-button =
    .title = Inzoomen
pdfjs-zoom-in-button-label = Inzoomen
pdfjs-zoom-select =
    .title = Zoomen
pdfjs-presentation-mode-button =
    .title = Wisselen naar presentatiemodus
pdfjs-presentation-mode-button-label = Presentatiemodus
pdfjs-open-file-button =
    .title = Bestand openen
pdfjs-open-file-button-label = Openen
pdfjs-print-button =
    .title = Afdrukken
pdfjs-print-button-label = Afdrukken
pdfjs-save-button =
    .title = Opslaan
pdfjs-save-button-label = Opslaan
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Downloaden
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Downloaden
pdfjs-bookmark-button =
    .title = Huidige pagina (URL van huidige pagina bekijken)
pdfjs-bookmark-button-label = Huidige pagina
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Openen in app
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Openen in app

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Hulpmiddelen
pdfjs-tools-button-label = Hulpmiddelen
pdfjs-first-page-button =
    .title = Naar eerste pagina gaan
pdfjs-first-page-button-label = Naar eerste pagina gaan
pdfjs-last-page-button =
    .title = Naar laatste pagina gaan
pdfjs-last-page-button-label = Naar laatste pagina gaan
pdfjs-page-rotate-cw-button =
    .title = Rechtsom draaien
pdfjs-page-rotate-cw-button-label = Rechtsom draaien
pdfjs-page-rotate-ccw-button =
    .title = Linksom draaien
pdfjs-page-rotate-ccw-button-label = Linksom draaien
pdfjs-cursor-text-select-tool-button =
    .title = Tekstselectiehulpmiddel inschakelen
pdfjs-cursor-text-select-tool-button-label = Tekstselectiehulpmiddel
pdfjs-cursor-hand-tool-button =
    .title = Handhulpmiddel inschakelen
pdfjs-cursor-hand-tool-button-label = Handhulpmiddel
pdfjs-scroll-page-button =
    .title = Paginascrollen gebruiken
pdfjs-scroll-page-button-label = Paginascrollen
pdfjs-scroll-vertical-button =
    .title = Verticaal scrollen gebruiken
pdfjs-scroll-vertical-button-label = Verticaal scrollen
pdfjs-scroll-horizontal-button =
    .title = Horizontaal scrollen gebruiken
pdfjs-scroll-horizontal-button-label = Horizontaal scrollen
pdfjs-scroll-wrapped-button =
    .title = Scrollen met terugloop gebruiken
pdfjs-scroll-wrapped-button-label = Scrollen met terugloop
pdfjs-spread-none-button =
    .title = Dubbele pagina’s niet samenvoegen
pdfjs-spread-none-button-label = Geen dubbele pagina’s
pdfjs-spread-odd-button =
    .title = Dubbele pagina’s samenvoegen vanaf oneven pagina’s
pdfjs-spread-odd-button-label = Oneven dubbele pagina’s
pdfjs-spread-even-button =
    .title = Dubbele pagina’s samenvoegen vanaf even pagina’s
pdfjs-spread-even-button-label = Even dubbele pagina’s

## Document properties dialog

pdfjs-document-properties-button =
    .title = Documenteigenschappen…
pdfjs-document-properties-button-label = Documenteigenschappen…
pdfjs-document-properties-file-name = Bestandsnaam:
pdfjs-document-properties-file-size = Bestandsgrootte:
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
pdfjs-document-properties-subject = Onderwerp:
pdfjs-document-properties-keywords = Sleutelwoorden:
pdfjs-document-properties-creation-date = Aanmaakdatum:
pdfjs-document-properties-modification-date = Wijzigingsdatum:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Maker:
pdfjs-document-properties-producer = PDF-producent:
pdfjs-document-properties-version = PDF-versie:
pdfjs-document-properties-page-count = Aantal pagina’s:
pdfjs-document-properties-page-size = Paginagrootte:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = staand
pdfjs-document-properties-page-size-orientation-landscape = liggend
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
pdfjs-document-properties-linearized = Snelle webweergave:
pdfjs-document-properties-linearized-yes = Ja
pdfjs-document-properties-linearized-no = Nee
pdfjs-document-properties-close-button = Sluiten

## Print

pdfjs-print-progress-message = Document voorbereiden voor afdrukken…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Annuleren
pdfjs-printing-not-supported = Waarschuwing: afdrukken wordt niet volledig ondersteund door deze browser.
pdfjs-printing-not-ready = Waarschuwing: de PDF is niet volledig geladen voor afdrukken.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Zijbalk in-/uitschakelen
pdfjs-toggle-sidebar-notification-button =
    .title = Zijbalk in-/uitschakelen (document bevat overzicht/bijlagen/lagen)
pdfjs-toggle-sidebar-button-label = Zijbalk in-/uitschakelen
pdfjs-document-outline-button =
    .title = Documentoverzicht tonen (dubbelklik om alle items uit/samen te vouwen)
pdfjs-document-outline-button-label = Documentoverzicht
pdfjs-attachments-button =
    .title = Bijlagen tonen
pdfjs-attachments-button-label = Bijlagen
pdfjs-layers-button =
    .title = Lagen tonen (dubbelklik om alle lagen naar de standaardstatus terug te zetten)
pdfjs-layers-button-label = Lagen
pdfjs-thumbs-button =
    .title = Miniaturen tonen
pdfjs-thumbs-button-label = Miniaturen
pdfjs-current-outline-item-button =
    .title = Huidig item in inhoudsopgave zoeken
pdfjs-current-outline-item-button-label = Huidig item in inhoudsopgave
pdfjs-findbar-button =
    .title = Zoeken in document
pdfjs-findbar-button-label = Zoeken
pdfjs-additional-layers = Aanvullende lagen

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pagina { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatuur van pagina { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Zoeken
    .placeholder = Zoeken in document…
pdfjs-find-previous-button =
    .title = De vorige overeenkomst van de tekst zoeken
pdfjs-find-previous-button-label = Vorige
pdfjs-find-next-button =
    .title = De volgende overeenkomst van de tekst zoeken
pdfjs-find-next-button-label = Volgende
pdfjs-find-highlight-checkbox = Alles markeren
pdfjs-find-match-case-checkbox-label = Hoofdlettergevoelig
pdfjs-find-match-diacritics-checkbox-label = Diakritische tekens gebruiken
pdfjs-find-entire-word-checkbox-label = Hele woorden
pdfjs-find-reached-top = Bovenkant van document bereikt, doorgegaan vanaf onderkant
pdfjs-find-reached-bottom = Onderkant van document bereikt, doorgegaan vanaf bovenkant
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } van { $total } overeenkomst
       *[other] { $current } van { $total } overeenkomsten
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Meer dan { $limit } overeenkomst
       *[other] Meer dan { $limit } overeenkomsten
    }
pdfjs-find-not-found = Tekst niet gevonden

## Predefined zoom values

pdfjs-page-scale-width = Paginabreedte
pdfjs-page-scale-fit = Hele pagina
pdfjs-page-scale-auto = Automatisch zoomen
pdfjs-page-scale-actual = Werkelijke grootte
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Pagina { $page }

## Loading indicator messages

pdfjs-loading-error = Er is een fout opgetreden bij het laden van de PDF.
pdfjs-invalid-file-error = Ongeldig of beschadigd PDF-bestand.
pdfjs-missing-file-error = PDF-bestand ontbreekt.
pdfjs-unexpected-response-error = Onverwacht serverantwoord.
pdfjs-rendering-error = Er is een fout opgetreden bij het weergeven van de pagina.

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
    .alt = [{ $type }-aantekening]

## Password

pdfjs-password-label = Voer het wachtwoord in om dit PDF-bestand te openen.
pdfjs-password-invalid = Ongeldig wachtwoord. Probeer het opnieuw.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Annuleren
pdfjs-web-fonts-disabled = Weblettertypen zijn uitgeschakeld: gebruik van ingebedde PDF-lettertypen is niet mogelijk.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-free-text-button-label = Tekst
pdfjs-editor-ink-button =
    .title = Tekenen
pdfjs-editor-ink-button-label = Tekenen
pdfjs-editor-stamp-button =
    .title = Afbeeldingen toevoegen of bewerken
pdfjs-editor-stamp-button-label = Afbeeldingen toevoegen of bewerken
pdfjs-editor-highlight-button =
    .title = Markeren
pdfjs-editor-highlight-button-label = Markeren
pdfjs-highlight-floating-button =
    .title = Markeren
pdfjs-highlight-floating-button1 =
    .title = Markeren
    .aria-label = Markeren
pdfjs-highlight-floating-button-label = Markeren

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Tekening verwijderen
pdfjs-editor-remove-freetext-button =
    .title = Tekst verwijderen
pdfjs-editor-remove-stamp-button =
    .title = Afbeelding verwijderen
pdfjs-editor-remove-highlight-button =
    .title = Markering verwijderen

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Kleur
pdfjs-editor-free-text-size-input = Grootte
pdfjs-editor-ink-color-input = Kleur
pdfjs-editor-ink-thickness-input = Dikte
pdfjs-editor-ink-opacity-input = Opaciteit
pdfjs-editor-stamp-add-image-button =
    .title = Afbeelding toevoegen
pdfjs-editor-stamp-add-image-button-label = Afbeelding toevoegen
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Dikte
pdfjs-editor-free-highlight-thickness-title =
    .title = Dikte wijzigen bij accentuering van andere items dan tekst
pdfjs-free-text =
    .aria-label = Tekstbewerker
pdfjs-free-text-default-content = Begin met typen…
pdfjs-ink =
    .aria-label = Tekeningbewerker
pdfjs-ink-canvas =
    .aria-label = Door gebruiker gemaakte afbeelding

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternatieve tekst
pdfjs-editor-alt-text-edit-button-label = Alternatieve tekst bewerken
pdfjs-editor-alt-text-dialog-label = Kies een optie
pdfjs-editor-alt-text-dialog-description = Alternatieve tekst helpt wanneer mensen de afbeelding niet kunnen zien of wanneer deze niet wordt geladen.
pdfjs-editor-alt-text-add-description-label = Voeg een beschrijving toe
pdfjs-editor-alt-text-add-description-description = Streef naar 1-2 zinnen die het onderwerp, de omgeving of de acties beschrijven.
pdfjs-editor-alt-text-mark-decorative-label = Als decoratief markeren
pdfjs-editor-alt-text-mark-decorative-description = Dit wordt gebruikt voor sierafbeeldingen, zoals randen of watermerken.
pdfjs-editor-alt-text-cancel-button = Annuleren
pdfjs-editor-alt-text-save-button = Opslaan
pdfjs-editor-alt-text-decorative-tooltip = Als decoratief gemarkeerd
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Bijvoorbeeld: ‘Een jonge man gaat aan een tafel zitten om te eten’

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Linkerbovenhoek – formaat wijzigen
pdfjs-editor-resizer-label-top-middle = Midden boven – formaat wijzigen
pdfjs-editor-resizer-label-top-right = Rechterbovenhoek – formaat wijzigen
pdfjs-editor-resizer-label-middle-right = Midden rechts – formaat wijzigen
pdfjs-editor-resizer-label-bottom-right = Rechterbenedenhoek – formaat wijzigen
pdfjs-editor-resizer-label-bottom-middle = Midden onder – formaat wijzigen
pdfjs-editor-resizer-label-bottom-left = Linkerbenedenhoek – formaat wijzigen
pdfjs-editor-resizer-label-middle-left = Links midden – formaat wijzigen

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Markeringskleur
pdfjs-editor-colorpicker-button =
    .title = Kleur wijzigen
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Kleurkeuzes
pdfjs-editor-colorpicker-yellow =
    .title = Geel
pdfjs-editor-colorpicker-green =
    .title = Groen
pdfjs-editor-colorpicker-blue =
    .title = Blauw
pdfjs-editor-colorpicker-pink =
    .title = Roze
pdfjs-editor-colorpicker-red =
    .title = Rood

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Alles tonen
pdfjs-editor-highlight-show-all-button =
    .title = Alles tonen
