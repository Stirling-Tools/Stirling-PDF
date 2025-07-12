# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Iphepha langaphambili
pdfjs-previous-button-label = Okwangaphambili
pdfjs-next-button =
    .title = Iphepha elilandelayo
pdfjs-next-button-label = Okulandelayo
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Iphepha
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = kwali- { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } kwali { $pagesCount })
pdfjs-zoom-out-button =
    .title = Bhekelisela Kudana
pdfjs-zoom-out-button-label = Bhekelisela Kudana
pdfjs-zoom-in-button =
    .title = Sondeza Kufuphi
pdfjs-zoom-in-button-label = Sondeza Kufuphi
pdfjs-zoom-select =
    .title = Yandisa / Nciphisa
pdfjs-presentation-mode-button =
    .title = Tshintshela kwimo yonikezelo
pdfjs-presentation-mode-button-label = Imo yonikezelo
pdfjs-open-file-button =
    .title = Vula Ifayile
pdfjs-open-file-button-label = Vula
pdfjs-print-button =
    .title = Printa
pdfjs-print-button-label = Printa

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Izixhobo zemiyalelo
pdfjs-tools-button-label = Izixhobo zemiyalelo
pdfjs-first-page-button =
    .title = Yiya kwiphepha lokuqala
pdfjs-first-page-button-label = Yiya kwiphepha lokuqala
pdfjs-last-page-button =
    .title = Yiya kwiphepha lokugqibela
pdfjs-last-page-button-label = Yiya kwiphepha lokugqibela
pdfjs-page-rotate-cw-button =
    .title = Jikelisa ngasekunene
pdfjs-page-rotate-cw-button-label = Jikelisa ngasekunene
pdfjs-page-rotate-ccw-button =
    .title = Jikelisa ngasekhohlo
pdfjs-page-rotate-ccw-button-label = Jikelisa ngasekhohlo
pdfjs-cursor-text-select-tool-button =
    .title = Vumela iSixhobo sokuKhetha iTeksti
pdfjs-cursor-text-select-tool-button-label = ISixhobo sokuKhetha iTeksti
pdfjs-cursor-hand-tool-button =
    .title = Yenza iSixhobo seSandla siSebenze
pdfjs-cursor-hand-tool-button-label = ISixhobo seSandla

## Document properties dialog

pdfjs-document-properties-button =
    .title = Iipropati zoxwebhu…
pdfjs-document-properties-button-label = Iipropati zoxwebhu…
pdfjs-document-properties-file-name = Igama lefayile:
pdfjs-document-properties-file-size = Isayizi yefayile:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB (iibhayiti{ $size_b })
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB (iibhayithi{ $size_b })
pdfjs-document-properties-title = Umxholo:
pdfjs-document-properties-author = Umbhali:
pdfjs-document-properties-subject = Umbandela:
pdfjs-document-properties-keywords = Amagama aphambili:
pdfjs-document-properties-creation-date = Umhla wokwenziwa kwayo:
pdfjs-document-properties-modification-date = Umhla wokulungiswa kwayo:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Umntu oyenzileyo:
pdfjs-document-properties-producer = Umvelisi we-PDF:
pdfjs-document-properties-version = Uhlelo lwe-PDF:
pdfjs-document-properties-page-count = Inani lamaphepha:

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page


##

pdfjs-document-properties-close-button = Vala

## Print

pdfjs-print-progress-message = Ilungisa uxwebhu ukuze iprinte…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Rhoxisa
pdfjs-printing-not-supported = Isilumkiso: Ukuprinta akuxhaswa ngokupheleleyo yile bhrawuza.
pdfjs-printing-not-ready = Isilumkiso: IPDF ayihlohlwanga ngokupheleleyo ukwenzela ukuprinta.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Togola ngebha eseCaleni
pdfjs-toggle-sidebar-button-label = Togola ngebha eseCaleni
pdfjs-document-outline-button =
    .title = Bonisa uLwandlalo loXwebhu (cofa kabini ukuze wandise/diliza zonke izinto)
pdfjs-document-outline-button-label = Isishwankathelo soxwebhu
pdfjs-attachments-button =
    .title = Bonisa iziqhotyoshelwa
pdfjs-attachments-button-label = Iziqhoboshelo
pdfjs-thumbs-button =
    .title = Bonisa ukrobiso kumfanekiso
pdfjs-thumbs-button-label = Ukrobiso kumfanekiso
pdfjs-findbar-button =
    .title = Fumana kuXwebhu
pdfjs-findbar-button-label = Fumana

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Iphepha { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Ukrobiso kumfanekiso wephepha { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Fumana
    .placeholder = Fumana kuXwebhu…
pdfjs-find-previous-button =
    .title = Fumanisa isenzeko sangaphambili sebinzana lamagama
pdfjs-find-previous-button-label = Okwangaphambili
pdfjs-find-next-button =
    .title = Fumanisa isenzeko esilandelayo sebinzana lamagama
pdfjs-find-next-button-label = Okulandelayo
pdfjs-find-highlight-checkbox = Qaqambisa konke
pdfjs-find-match-case-checkbox-label = Tshatisa ngobukhulu bukanobumba
pdfjs-find-reached-top = Ufike ngaphezulu ephepheni, kusukwa ngezantsi
pdfjs-find-reached-bottom = Ufike ekupheleni kwephepha, kusukwa ngaphezulu
pdfjs-find-not-found = Ibinzana alifunyenwanga

## Predefined zoom values

pdfjs-page-scale-width = Ububanzi bephepha
pdfjs-page-scale-fit = Ukulinganiswa kwephepha
pdfjs-page-scale-auto = Ukwandisa/Ukunciphisa Ngokwayo
pdfjs-page-scale-actual = Ubungakanani bokwenene
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = Imposiso yenzekile xa kulayishwa i-PDF.
pdfjs-invalid-file-error = Ifayile ye-PDF engeyiyo okanye eyonakalisiweyo.
pdfjs-missing-file-error = Ifayile ye-PDF edukileyo.
pdfjs-unexpected-response-error = Impendulo yeseva engalindelekanga.
pdfjs-rendering-error = Imposiso yenzekile xa bekunikezelwa iphepha.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } Ubhalo-nqaku]

## Password

pdfjs-password-label = Faka ipasiwedi ukuze uvule le fayile yePDF.
pdfjs-password-invalid = Ipasiwedi ayisebenzi. Nceda uzame kwakhona.
pdfjs-password-ok-button = KULUNGILE
pdfjs-password-cancel-button = Rhoxisa
pdfjs-web-fonts-disabled = Iifonti zewebhu ziqhwalelisiwe: ayikwazi ukusebenzisa iifonti ze-PDF ezincanyathelisiweyo.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

