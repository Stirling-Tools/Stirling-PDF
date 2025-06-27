# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Laman Sebelumnya
pdfjs-previous-button-label = Sebelumnya
pdfjs-next-button =
    .title = Laman Selanjutnya
pdfjs-next-button-label = Selanjutnya
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Halaman
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = dari { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } dari { $pagesCount })
pdfjs-zoom-out-button =
    .title = Perkecil
pdfjs-zoom-out-button-label = Perkecil
pdfjs-zoom-in-button =
    .title = Perbesar
pdfjs-zoom-in-button-label = Perbesar
pdfjs-zoom-select =
    .title = Perbesaran
pdfjs-presentation-mode-button =
    .title = Ganti ke Mode Presentasi
pdfjs-presentation-mode-button-label = Mode Presentasi
pdfjs-open-file-button =
    .title = Buka Berkas
pdfjs-open-file-button-label = Buka
pdfjs-print-button =
    .title = Cetak
pdfjs-print-button-label = Cetak
pdfjs-save-button =
    .title = Simpan
pdfjs-save-button-label = Simpan
pdfjs-bookmark-button =
    .title = Laman Saat Ini (Lihat URL dari Laman Sekarang)
pdfjs-bookmark-button-label = Laman Saat Ini

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Alat
pdfjs-tools-button-label = Alat
pdfjs-first-page-button =
    .title = Buka Halaman Pertama
pdfjs-first-page-button-label = Buka Halaman Pertama
pdfjs-last-page-button =
    .title = Buka Halaman Terakhir
pdfjs-last-page-button-label = Buka Halaman Terakhir
pdfjs-page-rotate-cw-button =
    .title = Putar Searah Jarum Jam
pdfjs-page-rotate-cw-button-label = Putar Searah Jarum Jam
pdfjs-page-rotate-ccw-button =
    .title = Putar Berlawanan Arah Jarum Jam
pdfjs-page-rotate-ccw-button-label = Putar Berlawanan Arah Jarum Jam
pdfjs-cursor-text-select-tool-button =
    .title = Aktifkan Alat Seleksi Teks
pdfjs-cursor-text-select-tool-button-label = Alat Seleksi Teks
pdfjs-cursor-hand-tool-button =
    .title = Aktifkan Alat Tangan
pdfjs-cursor-hand-tool-button-label = Alat Tangan
pdfjs-scroll-page-button =
    .title = Gunakan Pengguliran Laman
pdfjs-scroll-page-button-label = Pengguliran Laman
pdfjs-scroll-vertical-button =
    .title = Gunakan Penggeseran Vertikal
pdfjs-scroll-vertical-button-label = Penggeseran Vertikal
pdfjs-scroll-horizontal-button =
    .title = Gunakan Penggeseran Horizontal
pdfjs-scroll-horizontal-button-label = Penggeseran Horizontal
pdfjs-scroll-wrapped-button =
    .title = Gunakan Penggeseran Terapit
pdfjs-scroll-wrapped-button-label = Penggeseran Terapit
pdfjs-spread-none-button =
    .title = Jangan gabungkan lembar halaman
pdfjs-spread-none-button-label = Tidak Ada Lembaran
pdfjs-spread-odd-button =
    .title = Gabungkan lembar lamanan mulai dengan halaman ganjil
pdfjs-spread-odd-button-label = Lembaran Ganjil
pdfjs-spread-even-button =
    .title = Gabungkan lembar halaman dimulai dengan halaman genap
pdfjs-spread-even-button-label = Lembaran Genap

## Document properties dialog

pdfjs-document-properties-button =
    .title = Properti Dokumen…
pdfjs-document-properties-button-label = Properti Dokumen…
pdfjs-document-properties-file-name = Nama berkas:
pdfjs-document-properties-file-size = Ukuran berkas:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } byte)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } byte)
pdfjs-document-properties-title = Judul:
pdfjs-document-properties-author = Penyusun:
pdfjs-document-properties-subject = Subjek:
pdfjs-document-properties-keywords = Kata Kunci:
pdfjs-document-properties-creation-date = Tanggal Dibuat:
pdfjs-document-properties-modification-date = Tanggal Dimodifikasi:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Pembuat:
pdfjs-document-properties-producer = Pemroduksi PDF:
pdfjs-document-properties-version = Versi PDF:
pdfjs-document-properties-page-count = Jumlah Halaman:
pdfjs-document-properties-page-size = Ukuran Laman:
pdfjs-document-properties-page-size-unit-inches = inci
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = tegak
pdfjs-document-properties-page-size-orientation-landscape = mendatar
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
pdfjs-document-properties-linearized = Tampilan Web Kilat:
pdfjs-document-properties-linearized-yes = Ya
pdfjs-document-properties-linearized-no = Tidak
pdfjs-document-properties-close-button = Tutup

## Print

pdfjs-print-progress-message = Menyiapkan dokumen untuk pencetakan…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Batalkan
pdfjs-printing-not-supported = Peringatan: Pencetakan tidak didukung secara lengkap pada peramban ini.
pdfjs-printing-not-ready = Peringatan: Berkas PDF masih belum dimuat secara lengkap untuk dapat dicetak.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Aktif/Nonaktifkan Bilah Samping
pdfjs-toggle-sidebar-notification-button =
    .title = Aktif/Nonaktifkan Bilah Samping (dokumen berisi kerangka/lampiran/lapisan)
pdfjs-toggle-sidebar-button-label = Aktif/Nonaktifkan Bilah Samping
pdfjs-document-outline-button =
    .title = Tampilkan Kerangka Dokumen (klik ganda untuk membentangkan/menciutkan semua item)
pdfjs-document-outline-button-label = Kerangka Dokumen
pdfjs-attachments-button =
    .title = Tampilkan Lampiran
pdfjs-attachments-button-label = Lampiran
pdfjs-layers-button =
    .title = Tampilkan Lapisan (klik ganda untuk mengatur ulang semua lapisan ke keadaan baku)
pdfjs-layers-button-label = Lapisan
pdfjs-thumbs-button =
    .title = Tampilkan Miniatur
pdfjs-thumbs-button-label = Miniatur
pdfjs-current-outline-item-button =
    .title = Cari Butir Ikhtisar Saat Ini
pdfjs-current-outline-item-button-label = Butir Ikhtisar Saat Ini
pdfjs-findbar-button =
    .title = Temukan di Dokumen
pdfjs-findbar-button-label = Temukan
pdfjs-additional-layers = Lapisan Tambahan

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Laman { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatur Laman { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Temukan
    .placeholder = Temukan di dokumen…
pdfjs-find-previous-button =
    .title = Temukan kata sebelumnya
pdfjs-find-previous-button-label = Sebelumnya
pdfjs-find-next-button =
    .title = Temukan lebih lanjut
pdfjs-find-next-button-label = Selanjutnya
pdfjs-find-highlight-checkbox = Sorot semuanya
pdfjs-find-match-case-checkbox-label = Cocokkan BESAR/kecil
pdfjs-find-match-diacritics-checkbox-label = Pencocokan Diakritik
pdfjs-find-entire-word-checkbox-label = Seluruh teks
pdfjs-find-reached-top = Sampai di awal dokumen, dilanjutkan dari bawah
pdfjs-find-reached-bottom = Sampai di akhir dokumen, dilanjutkan dari atas
pdfjs-find-not-found = Frasa tidak ditemukan

## Predefined zoom values

pdfjs-page-scale-width = Lebar Laman
pdfjs-page-scale-fit = Muat Laman
pdfjs-page-scale-auto = Perbesaran Otomatis
pdfjs-page-scale-actual = Ukuran Asli
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Halaman { $page }

## Loading indicator messages

pdfjs-loading-error = Galat terjadi saat memuat PDF.
pdfjs-invalid-file-error = Berkas PDF tidak valid atau rusak.
pdfjs-missing-file-error = Berkas PDF tidak ada.
pdfjs-unexpected-response-error = Balasan server yang tidak diharapkan.
pdfjs-rendering-error = Galat terjadi saat merender laman.

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
    .alt = [Anotasi { $type }]

## Password

pdfjs-password-label = Masukkan sandi untuk membuka berkas PDF ini.
pdfjs-password-invalid = Sandi tidak valid. Silakan coba lagi.
pdfjs-password-ok-button = Oke
pdfjs-password-cancel-button = Batal
pdfjs-web-fonts-disabled = Font web dinonaktifkan: tidak dapat menggunakan font PDF yang tersemat.

## Editing

pdfjs-editor-free-text-button =
    .title = Teks
pdfjs-editor-free-text-button-label = Teks
pdfjs-editor-ink-button =
    .title = Gambar
pdfjs-editor-ink-button-label = Gambar
# Editor Parameters
pdfjs-editor-free-text-color-input = Warna
pdfjs-editor-free-text-size-input = Ukuran
pdfjs-editor-ink-color-input = Warna
pdfjs-editor-ink-thickness-input = Ketebalan
pdfjs-editor-ink-opacity-input = Opasitas
pdfjs-free-text =
    .aria-label = Editor Teks
pdfjs-free-text-default-content = Mulai mengetik…
pdfjs-ink =
    .aria-label = Editor Gambar
pdfjs-ink-canvas =
    .aria-label = Gambar yang dibuat pengguna

## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

