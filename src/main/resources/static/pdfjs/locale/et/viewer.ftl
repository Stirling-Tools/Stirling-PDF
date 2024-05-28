# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Eelmine lehekülg
pdfjs-previous-button-label = Eelmine
pdfjs-next-button =
    .title = Järgmine lehekülg
pdfjs-next-button-label = Järgmine
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Leht
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = / { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber }/{ $pagesCount })
pdfjs-zoom-out-button =
    .title = Vähenda
pdfjs-zoom-out-button-label = Vähenda
pdfjs-zoom-in-button =
    .title = Suurenda
pdfjs-zoom-in-button-label = Suurenda
pdfjs-zoom-select =
    .title = Suurendamine
pdfjs-presentation-mode-button =
    .title = Lülitu esitlusrežiimi
pdfjs-presentation-mode-button-label = Esitlusrežiim
pdfjs-open-file-button =
    .title = Ava fail
pdfjs-open-file-button-label = Ava
pdfjs-print-button =
    .title = Prindi
pdfjs-print-button-label = Prindi

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Tööriistad
pdfjs-tools-button-label = Tööriistad
pdfjs-first-page-button =
    .title = Mine esimesele leheküljele
pdfjs-first-page-button-label = Mine esimesele leheküljele
pdfjs-last-page-button =
    .title = Mine viimasele leheküljele
pdfjs-last-page-button-label = Mine viimasele leheküljele
pdfjs-page-rotate-cw-button =
    .title = Pööra päripäeva
pdfjs-page-rotate-cw-button-label = Pööra päripäeva
pdfjs-page-rotate-ccw-button =
    .title = Pööra vastupäeva
pdfjs-page-rotate-ccw-button-label = Pööra vastupäeva
pdfjs-cursor-text-select-tool-button =
    .title = Luba teksti valimise tööriist
pdfjs-cursor-text-select-tool-button-label = Teksti valimise tööriist
pdfjs-cursor-hand-tool-button =
    .title = Luba sirvimistööriist
pdfjs-cursor-hand-tool-button-label = Sirvimistööriist
pdfjs-scroll-page-button =
    .title = Kasutatakse lehe kaupa kerimist
pdfjs-scroll-page-button-label = Lehe kaupa kerimine
pdfjs-scroll-vertical-button =
    .title = Kasuta vertikaalset kerimist
pdfjs-scroll-vertical-button-label = Vertikaalne kerimine
pdfjs-scroll-horizontal-button =
    .title = Kasuta horisontaalset kerimist
pdfjs-scroll-horizontal-button-label = Horisontaalne kerimine
pdfjs-scroll-wrapped-button =
    .title = Kasuta rohkem mahutavat kerimist
pdfjs-scroll-wrapped-button-label = Rohkem mahutav kerimine
pdfjs-spread-none-button =
    .title = Ära kõrvuta lehekülgi
pdfjs-spread-none-button-label = Lehtede kõrvutamine puudub
pdfjs-spread-odd-button =
    .title = Kõrvuta leheküljed, alustades paaritute numbritega lehekülgedega
pdfjs-spread-odd-button-label = Kõrvutamine paaritute numbritega alustades
pdfjs-spread-even-button =
    .title = Kõrvuta leheküljed, alustades paarisnumbritega lehekülgedega
pdfjs-spread-even-button-label = Kõrvutamine paarisnumbritega alustades

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumendi omadused…
pdfjs-document-properties-button-label = Dokumendi omadused…
pdfjs-document-properties-file-name = Faili nimi:
pdfjs-document-properties-file-size = Faili suurus:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KiB ({ $size_b } baiti)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MiB ({ $size_b } baiti)
pdfjs-document-properties-title = Pealkiri:
pdfjs-document-properties-author = Autor:
pdfjs-document-properties-subject = Teema:
pdfjs-document-properties-keywords = Märksõnad:
pdfjs-document-properties-creation-date = Loodud:
pdfjs-document-properties-modification-date = Muudetud:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date } { $time }
pdfjs-document-properties-creator = Looja:
pdfjs-document-properties-producer = Generaator:
pdfjs-document-properties-version = Generaatori versioon:
pdfjs-document-properties-page-count = Lehekülgi:
pdfjs-document-properties-page-size = Lehe suurus:
pdfjs-document-properties-page-size-unit-inches = tolli
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = vertikaalpaigutus
pdfjs-document-properties-page-size-orientation-landscape = rõhtpaigutus
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
pdfjs-document-properties-linearized = "Fast Web View" tugi:
pdfjs-document-properties-linearized-yes = Jah
pdfjs-document-properties-linearized-no = Ei
pdfjs-document-properties-close-button = Sulge

## Print

pdfjs-print-progress-message = Dokumendi ettevalmistamine printimiseks…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Loobu
pdfjs-printing-not-supported = Hoiatus: printimine pole selle brauseri poolt täielikult toetatud.
pdfjs-printing-not-ready = Hoiatus: PDF pole printimiseks täielikult laaditud.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Näita külgriba
pdfjs-toggle-sidebar-notification-button =
    .title = Näita külgriba (dokument sisaldab sisukorda/manuseid/kihte)
pdfjs-toggle-sidebar-button-label = Näita külgriba
pdfjs-document-outline-button =
    .title = Näita sisukorda (kõigi punktide laiendamiseks/ahendamiseks topeltklõpsa)
pdfjs-document-outline-button-label = Näita sisukorda
pdfjs-attachments-button =
    .title = Näita manuseid
pdfjs-attachments-button-label = Manused
pdfjs-layers-button =
    .title = Näita kihte (kõikide kihtide vaikeolekusse lähtestamiseks topeltklõpsa)
pdfjs-layers-button-label = Kihid
pdfjs-thumbs-button =
    .title = Näita pisipilte
pdfjs-thumbs-button-label = Pisipildid
pdfjs-current-outline-item-button =
    .title = Otsi üles praegune kontuuriüksus
pdfjs-current-outline-item-button-label = Praegune kontuuriüksus
pdfjs-findbar-button =
    .title = Otsi dokumendist
pdfjs-findbar-button-label = Otsi
pdfjs-additional-layers = Täiendavad kihid

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = { $page }. lehekülg
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page }. lehekülje pisipilt

## Find panel button title and messages

pdfjs-find-input =
    .title = Otsi
    .placeholder = Otsi dokumendist…
pdfjs-find-previous-button =
    .title = Otsi fraasi eelmine esinemiskoht
pdfjs-find-previous-button-label = Eelmine
pdfjs-find-next-button =
    .title = Otsi fraasi järgmine esinemiskoht
pdfjs-find-next-button-label = Järgmine
pdfjs-find-highlight-checkbox = Too kõik esile
pdfjs-find-match-case-checkbox-label = Tõstutundlik
pdfjs-find-match-diacritics-checkbox-label = Otsitakse diakriitiliselt
pdfjs-find-entire-word-checkbox-label = Täissõnad
pdfjs-find-reached-top = Jõuti dokumendi algusesse, jätkati lõpust
pdfjs-find-reached-bottom = Jõuti dokumendi lõppu, jätkati algusest
pdfjs-find-not-found = Fraasi ei leitud

## Predefined zoom values

pdfjs-page-scale-width = Mahuta laiusele
pdfjs-page-scale-fit = Mahuta leheküljele
pdfjs-page-scale-auto = Automaatne suurendamine
pdfjs-page-scale-actual = Tegelik suurus
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Lehekülg { $page }

## Loading indicator messages

pdfjs-loading-error = PDFi laadimisel esines viga.
pdfjs-invalid-file-error = Vigane või rikutud PDF-fail.
pdfjs-missing-file-error = PDF-fail puudub.
pdfjs-unexpected-response-error = Ootamatu vastus serverilt.
pdfjs-rendering-error = Lehe renderdamisel esines viga.

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
    .alt = [{ $type } Annotation]

## Password

pdfjs-password-label = PDF-faili avamiseks sisesta parool.
pdfjs-password-invalid = Vigane parool. Palun proovi uuesti.
pdfjs-password-ok-button = Sobib
pdfjs-password-cancel-button = Loobu
pdfjs-web-fonts-disabled = Veebifondid on keelatud: PDFiga kaasatud fonte pole võimalik kasutada.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

