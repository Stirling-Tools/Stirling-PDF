# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Edellinen sivu
pdfjs-previous-button-label = Edellinen
pdfjs-next-button =
    .title = Seuraava sivu
pdfjs-next-button-label = Seuraava
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Sivu
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = / { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } / { $pagesCount })
pdfjs-zoom-out-button =
    .title = Loitonna
pdfjs-zoom-out-button-label = Loitonna
pdfjs-zoom-in-button =
    .title = Lähennä
pdfjs-zoom-in-button-label = Lähennä
pdfjs-zoom-select =
    .title = Suurennus
pdfjs-presentation-mode-button =
    .title = Siirry esitystilaan
pdfjs-presentation-mode-button-label = Esitystila
pdfjs-open-file-button =
    .title = Avaa tiedosto
pdfjs-open-file-button-label = Avaa
pdfjs-print-button =
    .title = Tulosta
pdfjs-print-button-label = Tulosta
pdfjs-save-button =
    .title = Tallenna
pdfjs-save-button-label = Tallenna
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Lataa
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Lataa
pdfjs-bookmark-button =
    .title = Nykyinen sivu (Näytä URL-osoite nykyiseltä sivulta)
pdfjs-bookmark-button-label = Nykyinen sivu
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Avaa sovelluksessa
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Avaa sovelluksessa

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Tools
pdfjs-tools-button-label = Tools
pdfjs-first-page-button =
    .title = Siirry ensimmäiselle sivulle
pdfjs-first-page-button-label = Siirry ensimmäiselle sivulle
pdfjs-last-page-button =
    .title = Siirry viimeiselle sivulle
pdfjs-last-page-button-label = Siirry viimeiselle sivulle
pdfjs-page-rotate-cw-button =
    .title = Kierrä oikealle
pdfjs-page-rotate-cw-button-label = Kierrä oikealle
pdfjs-page-rotate-ccw-button =
    .title = Kierrä vasemmalle
pdfjs-page-rotate-ccw-button-label = Kierrä vasemmalle
pdfjs-cursor-text-select-tool-button =
    .title = Käytä tekstinvalintatyökalua
pdfjs-cursor-text-select-tool-button-label = Tekstinvalintatyökalu
pdfjs-cursor-hand-tool-button =
    .title = Käytä käsityökalua
pdfjs-cursor-hand-tool-button-label = Käsityökalu
pdfjs-scroll-page-button =
    .title = Käytä sivun vieritystä
pdfjs-scroll-page-button-label = Sivun vieritys
pdfjs-scroll-vertical-button =
    .title = Käytä pystysuuntaista vieritystä
pdfjs-scroll-vertical-button-label = Pystysuuntainen vieritys
pdfjs-scroll-horizontal-button =
    .title = Käytä vaakasuuntaista vieritystä
pdfjs-scroll-horizontal-button-label = Vaakasuuntainen vieritys
pdfjs-scroll-wrapped-button =
    .title = Käytä rivittyvää vieritystä
pdfjs-scroll-wrapped-button-label = Rivittyvä vieritys
pdfjs-spread-none-button =
    .title = Älä yhdistä sivuja aukeamiksi
pdfjs-spread-none-button-label = Ei aukeamia
pdfjs-spread-odd-button =
    .title = Yhdistä sivut aukeamiksi alkaen parittomalta sivulta
pdfjs-spread-odd-button-label = Parittomalta alkavat aukeamat
pdfjs-spread-even-button =
    .title = Yhdistä sivut aukeamiksi alkaen parilliselta sivulta
pdfjs-spread-even-button-label = Parilliselta alkavat aukeamat

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumentin ominaisuudet…
pdfjs-document-properties-button-label = Dokumentin ominaisuudet…
pdfjs-document-properties-file-name = Tiedoston nimi:
pdfjs-document-properties-file-size = Tiedoston koko:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } kt ({ $size_b } tavua)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } Mt ({ $size_b } tavua)
pdfjs-document-properties-title = Otsikko:
pdfjs-document-properties-author = Tekijä:
pdfjs-document-properties-subject = Aihe:
pdfjs-document-properties-keywords = Avainsanat:
pdfjs-document-properties-creation-date = Luomispäivämäärä:
pdfjs-document-properties-modification-date = Muokkauspäivämäärä:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Luoja:
pdfjs-document-properties-producer = PDF-tuottaja:
pdfjs-document-properties-version = PDF-versio:
pdfjs-document-properties-page-count = Sivujen määrä:
pdfjs-document-properties-page-size = Sivun koko:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = pysty
pdfjs-document-properties-page-size-orientation-landscape = vaaka
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
pdfjs-document-properties-linearized = Nopea web-katselu:
pdfjs-document-properties-linearized-yes = Kyllä
pdfjs-document-properties-linearized-no = Ei
pdfjs-document-properties-close-button = Sulje

## Print

pdfjs-print-progress-message = Valmistellaan dokumenttia tulostamista varten…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress } %
pdfjs-print-progress-close-button = Peruuta
pdfjs-printing-not-supported = Varoitus: Selain ei tue kaikkia tulostustapoja.
pdfjs-printing-not-ready = Varoitus: PDF-tiedosto ei ole vielä latautunut kokonaan, eikä sitä voi vielä tulostaa.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Näytä/piilota sivupaneeli
pdfjs-toggle-sidebar-notification-button =
    .title = Näytä/piilota sivupaneeli (dokumentissa on sisällys/liitteitä/tasoja)
pdfjs-toggle-sidebar-button-label = Näytä/piilota sivupaneeli
pdfjs-document-outline-button =
    .title = Näytä dokumentin sisällys (laajenna tai kutista kohdat kaksoisnapsauttamalla)
pdfjs-document-outline-button-label = Dokumentin sisällys
pdfjs-attachments-button =
    .title = Näytä liitteet
pdfjs-attachments-button-label = Liitteet
pdfjs-layers-button =
    .title = Näytä tasot (kaksoisnapsauta palauttaaksesi kaikki tasot oletustilaan)
pdfjs-layers-button-label = Tasot
pdfjs-thumbs-button =
    .title = Näytä pienoiskuvat
pdfjs-thumbs-button-label = Pienoiskuvat
pdfjs-current-outline-item-button =
    .title = Etsi nykyinen sisällyksen kohta
pdfjs-current-outline-item-button-label = Nykyinen sisällyksen kohta
pdfjs-findbar-button =
    .title = Etsi dokumentista
pdfjs-findbar-button-label = Etsi
pdfjs-additional-layers = Lisätasot

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Sivu { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Pienoiskuva sivusta { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Etsi
    .placeholder = Etsi dokumentista…
pdfjs-find-previous-button =
    .title = Etsi hakusanan edellinen osuma
pdfjs-find-previous-button-label = Edellinen
pdfjs-find-next-button =
    .title = Etsi hakusanan seuraava osuma
pdfjs-find-next-button-label = Seuraava
pdfjs-find-highlight-checkbox = Korosta kaikki
pdfjs-find-match-case-checkbox-label = Huomioi kirjainkoko
pdfjs-find-match-diacritics-checkbox-label = Erota tarkkeet
pdfjs-find-entire-word-checkbox-label = Kokonaiset sanat
pdfjs-find-reached-top = Päästiin dokumentin alkuun, jatketaan lopusta
pdfjs-find-reached-bottom = Päästiin dokumentin loppuun, jatketaan alusta
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } / { $total } osuma
       *[other] { $current } / { $total } osumaa
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Yli { $limit } osuma
       *[other] Yli { $limit } osumaa
    }
pdfjs-find-not-found = Hakusanaa ei löytynyt

## Predefined zoom values

pdfjs-page-scale-width = Sivun leveys
pdfjs-page-scale-fit = Koko sivu
pdfjs-page-scale-auto = Automaattinen suurennus
pdfjs-page-scale-actual = Todellinen koko
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale } %

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Sivu { $page }

## Loading indicator messages

pdfjs-loading-error = Tapahtui virhe ladattaessa PDF-tiedostoa.
pdfjs-invalid-file-error = Virheellinen tai vioittunut PDF-tiedosto.
pdfjs-missing-file-error = Puuttuva PDF-tiedosto.
pdfjs-unexpected-response-error = Odottamaton vastaus palvelimelta.
pdfjs-rendering-error = Tapahtui virhe piirrettäessä sivua.

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
    .alt = [{ $type }-merkintä]

## Password

pdfjs-password-label = Kirjoita PDF-tiedoston salasana.
pdfjs-password-invalid = Virheellinen salasana. Yritä uudestaan.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Peruuta
pdfjs-web-fonts-disabled = Verkkosivujen omat kirjasinlajit on estetty: ei voida käyttää upotettuja PDF-kirjasinlajeja.

## Editing

pdfjs-editor-free-text-button =
    .title = Teksti
pdfjs-editor-free-text-button-label = Teksti
pdfjs-editor-ink-button =
    .title = Piirros
pdfjs-editor-ink-button-label = Piirros
pdfjs-editor-stamp-button =
    .title = Lisää tai muokkaa kuvia
pdfjs-editor-stamp-button-label = Lisää tai muokkaa kuvia
pdfjs-editor-highlight-button =
    .title = Korostus
pdfjs-editor-highlight-button-label = Korostus
pdfjs-highlight-floating-button =
    .title = Korostus
pdfjs-highlight-floating-button1 =
    .title = Korostus
    .aria-label = Korostus
pdfjs-highlight-floating-button-label = Korostus

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Poista piirros
pdfjs-editor-remove-freetext-button =
    .title = Poista teksti
pdfjs-editor-remove-stamp-button =
    .title = Poista kuva
pdfjs-editor-remove-highlight-button =
    .title = Poista korostus

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Väri
pdfjs-editor-free-text-size-input = Koko
pdfjs-editor-ink-color-input = Väri
pdfjs-editor-ink-thickness-input = Paksuus
pdfjs-editor-ink-opacity-input = Peittävyys
pdfjs-editor-stamp-add-image-button =
    .title = Lisää kuva
pdfjs-editor-stamp-add-image-button-label = Lisää kuva
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Paksuus
pdfjs-editor-free-highlight-thickness-title =
    .title = Muuta paksuutta korostaessasi muita kohteita kuin tekstiä
pdfjs-free-text =
    .aria-label = Tekstimuokkain
pdfjs-free-text-default-content = Aloita kirjoittaminen…
pdfjs-ink =
    .aria-label = Piirrustusmuokkain
pdfjs-ink-canvas =
    .aria-label = Käyttäjän luoma kuva

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Vaihtoehtoinen teksti
pdfjs-editor-alt-text-edit-button-label = Muokkaa vaihtoehtoista tekstiä
pdfjs-editor-alt-text-dialog-label = Valitse vaihtoehto
pdfjs-editor-alt-text-dialog-description = Vaihtoehtoinen teksti ("alt-teksti") auttaa ihmisiä, jotka eivät näe kuvaa tai kun kuva ei lataudu.
pdfjs-editor-alt-text-add-description-label = Lisää kuvaus
pdfjs-editor-alt-text-add-description-description = Pyri 1-2 lauseeseen, jotka kuvaavat aihetta, ympäristöä tai toimintaa.
pdfjs-editor-alt-text-mark-decorative-label = Merkitse koristeelliseksi
pdfjs-editor-alt-text-mark-decorative-description = Tätä käytetään koristekuville, kuten reunuksille tai vesileimoille.
pdfjs-editor-alt-text-cancel-button = Peruuta
pdfjs-editor-alt-text-save-button = Tallenna
pdfjs-editor-alt-text-decorative-tooltip = Merkitty koristeelliseksi
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Esimerkiksi "Nuori mies istuu pöytään syömään aterian"

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Vasen yläkulma - muuta kokoa
pdfjs-editor-resizer-label-top-middle = Ylhäällä keskellä - muuta kokoa
pdfjs-editor-resizer-label-top-right = Oikea yläkulma - muuta kokoa
pdfjs-editor-resizer-label-middle-right = Keskellä oikealla - muuta kokoa
pdfjs-editor-resizer-label-bottom-right = Oikea alakulma - muuta kokoa
pdfjs-editor-resizer-label-bottom-middle = Alhaalla keskellä - muuta kokoa
pdfjs-editor-resizer-label-bottom-left = Vasen alakulma - muuta kokoa
pdfjs-editor-resizer-label-middle-left = Keskellä vasemmalla - muuta kokoa

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Korostusväri
pdfjs-editor-colorpicker-button =
    .title = Vaihda väri
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Värivalinnat
pdfjs-editor-colorpicker-yellow =
    .title = Keltainen
pdfjs-editor-colorpicker-green =
    .title = Vihreä
pdfjs-editor-colorpicker-blue =
    .title = Sininen
pdfjs-editor-colorpicker-pink =
    .title = Pinkki
pdfjs-editor-colorpicker-red =
    .title = Punainen

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Näytä kaikki
pdfjs-editor-highlight-show-all-button =
    .title = Näytä kaikki
