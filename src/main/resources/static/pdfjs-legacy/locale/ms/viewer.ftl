# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Halaman Dahulu
pdfjs-previous-button-label = Dahulu
pdfjs-next-button =
    .title = Halaman Berikut
pdfjs-next-button-label = Berikut
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Halaman
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = daripada { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } daripada { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zum Keluar
pdfjs-zoom-out-button-label = Zum Keluar
pdfjs-zoom-in-button =
    .title = Zum Masuk
pdfjs-zoom-in-button-label = Zum Masuk
pdfjs-zoom-select =
    .title = Zum
pdfjs-presentation-mode-button =
    .title = Tukar ke Mod Persembahan
pdfjs-presentation-mode-button-label = Mod Persembahan
pdfjs-open-file-button =
    .title = Buka Fail
pdfjs-open-file-button-label = Buka
pdfjs-print-button =
    .title = Cetak
pdfjs-print-button-label = Cetak

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Alatan
pdfjs-tools-button-label = Alatan
pdfjs-first-page-button =
    .title = Pergi ke Halaman Pertama
pdfjs-first-page-button-label = Pergi ke Halaman Pertama
pdfjs-last-page-button =
    .title = Pergi ke Halaman Terakhir
pdfjs-last-page-button-label = Pergi ke Halaman Terakhir
pdfjs-page-rotate-cw-button =
    .title = Berputar ikut arah Jam
pdfjs-page-rotate-cw-button-label = Berputar ikut arah Jam
pdfjs-page-rotate-ccw-button =
    .title = Pusing berlawan arah jam
pdfjs-page-rotate-ccw-button-label = Pusing berlawan arah jam
pdfjs-cursor-text-select-tool-button =
    .title = Dayakan Alatan Pilihan Teks
pdfjs-cursor-text-select-tool-button-label = Alatan Pilihan Teks
pdfjs-cursor-hand-tool-button =
    .title = Dayakan Alatan Tangan
pdfjs-cursor-hand-tool-button-label = Alatan Tangan
pdfjs-scroll-vertical-button =
    .title = Guna Skrol Menegak
pdfjs-scroll-vertical-button-label = Skrol Menegak
pdfjs-scroll-horizontal-button =
    .title = Guna Skrol Mengufuk
pdfjs-scroll-horizontal-button-label = Skrol Mengufuk
pdfjs-scroll-wrapped-button =
    .title = Guna Skrol Berbalut
pdfjs-scroll-wrapped-button-label = Skrol Berbalut
pdfjs-spread-none-button =
    .title = Jangan hubungkan hamparan halaman
pdfjs-spread-none-button-label = Tanpa Hamparan
pdfjs-spread-odd-button =
    .title = Hubungkan hamparan halaman dengan halaman nombor ganjil
pdfjs-spread-odd-button-label = Hamparan Ganjil
pdfjs-spread-even-button =
    .title = Hubungkan hamparan halaman dengan halaman nombor genap
pdfjs-spread-even-button-label = Hamparan Seimbang

## Document properties dialog

pdfjs-document-properties-button =
    .title = Sifat Dokumen…
pdfjs-document-properties-button-label = Sifat Dokumen…
pdfjs-document-properties-file-name = Nama fail:
pdfjs-document-properties-file-size = Saiz fail:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bait)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bait)
pdfjs-document-properties-title = Tajuk:
pdfjs-document-properties-author = Pengarang:
pdfjs-document-properties-subject = Subjek:
pdfjs-document-properties-keywords = Kata kunci:
pdfjs-document-properties-creation-date = Masa Dicipta:
pdfjs-document-properties-modification-date = Tarikh Ubahsuai:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Pencipta:
pdfjs-document-properties-producer = Pengeluar PDF:
pdfjs-document-properties-version = Versi PDF:
pdfjs-document-properties-page-count = Kiraan Laman:
pdfjs-document-properties-page-size = Saiz Halaman:
pdfjs-document-properties-page-size-unit-inches = dalam
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = potret
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
pdfjs-document-properties-linearized = Paparan Web Pantas:
pdfjs-document-properties-linearized-yes = Ya
pdfjs-document-properties-linearized-no = Tidak
pdfjs-document-properties-close-button = Tutup

## Print

pdfjs-print-progress-message = Menyediakan dokumen untuk dicetak…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Batal
pdfjs-printing-not-supported = Amaran: Cetakan ini tidak sepenuhnya disokong oleh pelayar ini.
pdfjs-printing-not-ready = Amaran: PDF tidak sepenuhnya dimuatkan untuk dicetak.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Togol Bar Sisi
pdfjs-toggle-sidebar-button-label = Togol Bar Sisi
pdfjs-document-outline-button =
    .title = Papar Rangka Dokumen (klik-dua-kali untuk kembangkan/kolaps semua item)
pdfjs-document-outline-button-label = Rangka Dokumen
pdfjs-attachments-button =
    .title = Papar Lampiran
pdfjs-attachments-button-label = Lampiran
pdfjs-thumbs-button =
    .title = Papar Thumbnails
pdfjs-thumbs-button-label = Imej kecil
pdfjs-findbar-button =
    .title = Cari didalam Dokumen
pdfjs-findbar-button-label = Cari

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Halaman { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Halaman Imej kecil { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Cari
    .placeholder = Cari dalam dokumen…
pdfjs-find-previous-button =
    .title = Cari teks frasa berkenaan yang terdahulu
pdfjs-find-previous-button-label = Dahulu
pdfjs-find-next-button =
    .title = Cari teks frasa berkenaan yang berikut
pdfjs-find-next-button-label = Berikut
pdfjs-find-highlight-checkbox = Serlahkan semua
pdfjs-find-match-case-checkbox-label = Huruf sepadan
pdfjs-find-entire-word-checkbox-label = Seluruh perkataan
pdfjs-find-reached-top = Mencapai teratas daripada dokumen, sambungan daripada bawah
pdfjs-find-reached-bottom = Mencapai terakhir daripada dokumen, sambungan daripada atas
pdfjs-find-not-found = Frasa tidak ditemui

## Predefined zoom values

pdfjs-page-scale-width = Lebar Halaman
pdfjs-page-scale-fit = Muat Halaman
pdfjs-page-scale-auto = Zoom Automatik
pdfjs-page-scale-actual = Saiz Sebenar
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = Masalah berlaku semasa menuatkan sebuah PDF.
pdfjs-invalid-file-error = Tidak sah atau fail PDF rosak.
pdfjs-missing-file-error = Fail PDF Hilang.
pdfjs-unexpected-response-error = Respon pelayan yang tidak dijangka.
pdfjs-rendering-error = Ralat berlaku ketika memberikan halaman.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } Anotasi]

## Password

pdfjs-password-label = Masukan kata kunci untuk membuka fail PDF ini.
pdfjs-password-invalid = Kata laluan salah. Cuba lagi.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Batal
pdfjs-web-fonts-disabled = Fon web dinyahdayakan: tidak dapat menggunakan fon terbenam PDF.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

