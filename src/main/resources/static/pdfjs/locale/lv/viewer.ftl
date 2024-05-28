# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Iepriekšējā lapa
pdfjs-previous-button-label = Iepriekšējā
pdfjs-next-button =
    .title = Nākamā lapa
pdfjs-next-button-label = Nākamā
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Lapa
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = no { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } no { $pagesCount })
pdfjs-zoom-out-button =
    .title = Attālināt
pdfjs-zoom-out-button-label = Attālināt
pdfjs-zoom-in-button =
    .title = Pietuvināt
pdfjs-zoom-in-button-label = Pietuvināt
pdfjs-zoom-select =
    .title = Palielinājums
pdfjs-presentation-mode-button =
    .title = Pārslēgties uz Prezentācijas režīmu
pdfjs-presentation-mode-button-label = Prezentācijas režīms
pdfjs-open-file-button =
    .title = Atvērt failu
pdfjs-open-file-button-label = Atvērt
pdfjs-print-button =
    .title = Drukāšana
pdfjs-print-button-label = Drukāt

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Rīki
pdfjs-tools-button-label = Rīki
pdfjs-first-page-button =
    .title = Iet uz pirmo lapu
pdfjs-first-page-button-label = Iet uz pirmo lapu
pdfjs-last-page-button =
    .title = Iet uz pēdējo lapu
pdfjs-last-page-button-label = Iet uz pēdējo lapu
pdfjs-page-rotate-cw-button =
    .title = Pagriezt pa pulksteni
pdfjs-page-rotate-cw-button-label = Pagriezt pa pulksteni
pdfjs-page-rotate-ccw-button =
    .title = Pagriezt pret pulksteni
pdfjs-page-rotate-ccw-button-label = Pagriezt pret pulksteni
pdfjs-cursor-text-select-tool-button =
    .title = Aktivizēt teksta izvēles rīku
pdfjs-cursor-text-select-tool-button-label = Teksta izvēles rīks
pdfjs-cursor-hand-tool-button =
    .title = Aktivēt rokas rīku
pdfjs-cursor-hand-tool-button-label = Rokas rīks
pdfjs-scroll-vertical-button =
    .title = Izmantot vertikālo ritināšanu
pdfjs-scroll-vertical-button-label = Vertikālā ritināšana
pdfjs-scroll-horizontal-button =
    .title = Izmantot horizontālo ritināšanu
pdfjs-scroll-horizontal-button-label = Horizontālā ritināšana
pdfjs-scroll-wrapped-button =
    .title = Izmantot apkļauto ritināšanu
pdfjs-scroll-wrapped-button-label = Apkļautā ritināšana
pdfjs-spread-none-button =
    .title = Nepievienoties lapu izpletumiem
pdfjs-spread-none-button-label = Neizmantot izpletumus
pdfjs-spread-odd-button =
    .title = Izmantot lapu izpletumus sākot ar nepāra numuru lapām
pdfjs-spread-odd-button-label = Nepāra izpletumi
pdfjs-spread-even-button =
    .title = Izmantot lapu izpletumus sākot ar pāra numuru lapām
pdfjs-spread-even-button-label = Pāra izpletumi

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumenta iestatījumi…
pdfjs-document-properties-button-label = Dokumenta iestatījumi…
pdfjs-document-properties-file-name = Faila nosaukums:
pdfjs-document-properties-file-size = Faila izmērs:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } biti)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } biti)
pdfjs-document-properties-title = Nosaukums:
pdfjs-document-properties-author = Autors:
pdfjs-document-properties-subject = Tēma:
pdfjs-document-properties-keywords = Atslēgas vārdi:
pdfjs-document-properties-creation-date = Izveides datums:
pdfjs-document-properties-modification-date = LAbošanas datums:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Radītājs:
pdfjs-document-properties-producer = PDF producents:
pdfjs-document-properties-version = PDF versija:
pdfjs-document-properties-page-count = Lapu skaits:
pdfjs-document-properties-page-size = Papīra izmērs:
pdfjs-document-properties-page-size-unit-inches = collas
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = portretorientācija
pdfjs-document-properties-page-size-orientation-landscape = ainavorientācija
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Vēstule
pdfjs-document-properties-page-size-name-legal = Juridiskie teksti

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
pdfjs-document-properties-linearized = Ātrā tīmekļa skats:
pdfjs-document-properties-linearized-yes = Jā
pdfjs-document-properties-linearized-no = Nē
pdfjs-document-properties-close-button = Aizvērt

## Print

pdfjs-print-progress-message = Gatavo dokumentu drukāšanai...
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Atcelt
pdfjs-printing-not-supported = Uzmanību: Drukāšana no šī pārlūka darbojas tikai daļēji.
pdfjs-printing-not-ready = Uzmanību: PDF nav pilnībā ielādēts drukāšanai.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Pārslēgt sānu joslu
pdfjs-toggle-sidebar-button-label = Pārslēgt sānu joslu
pdfjs-document-outline-button =
    .title = Rādīt dokumenta struktūru (veiciet dubultklikšķi lai izvērstu/sakļautu visus vienumus)
pdfjs-document-outline-button-label = Dokumenta saturs
pdfjs-attachments-button =
    .title = Rādīt pielikumus
pdfjs-attachments-button-label = Pielikumi
pdfjs-thumbs-button =
    .title = Parādīt sīktēlus
pdfjs-thumbs-button-label = Sīktēli
pdfjs-findbar-button =
    .title = Meklēt dokumentā
pdfjs-findbar-button-label = Meklēt

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Lapa { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Lapas { $page } sīktēls

## Find panel button title and messages

pdfjs-find-input =
    .title = Meklēt
    .placeholder = Meklēt dokumentā…
pdfjs-find-previous-button =
    .title = Atrast iepriekšējo
pdfjs-find-previous-button-label = Iepriekšējā
pdfjs-find-next-button =
    .title = Atrast nākamo
pdfjs-find-next-button-label = Nākamā
pdfjs-find-highlight-checkbox = Iekrāsot visas
pdfjs-find-match-case-checkbox-label = Lielo, mazo burtu jutīgs
pdfjs-find-entire-word-checkbox-label = Veselus vārdus
pdfjs-find-reached-top = Sasniegts dokumenta sākums, turpinām no beigām
pdfjs-find-reached-bottom = Sasniegtas dokumenta beigas, turpinām no sākuma
pdfjs-find-not-found = Frāze nav atrasta

## Predefined zoom values

pdfjs-page-scale-width = Lapas platumā
pdfjs-page-scale-fit = Ietilpinot lapu
pdfjs-page-scale-auto = Automātiskais izmērs
pdfjs-page-scale-actual = Patiesais izmērs
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = Ielādējot PDF notika kļūda.
pdfjs-invalid-file-error = Nederīgs vai bojāts PDF fails.
pdfjs-missing-file-error = PDF fails nav atrasts.
pdfjs-unexpected-response-error = Negaidīa servera atbilde.
pdfjs-rendering-error = Attēlojot lapu radās kļūda

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } anotācija]

## Password

pdfjs-password-label = Ievadiet paroli, lai atvērtu PDF failu.
pdfjs-password-invalid = Nepareiza parole, mēģiniet vēlreiz.
pdfjs-password-ok-button = Labi
pdfjs-password-cancel-button = Atcelt
pdfjs-web-fonts-disabled = Tīmekļa fonti nav aktivizēti: Nevar iegult PDF fontus.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

