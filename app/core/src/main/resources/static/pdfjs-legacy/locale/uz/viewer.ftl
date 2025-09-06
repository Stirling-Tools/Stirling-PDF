# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Oldingi sahifa
pdfjs-previous-button-label = Oldingi
pdfjs-next-button =
    .title = Keyingi sahifa
pdfjs-next-button-label = Keyingi
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = /{ $pagesCount }
pdfjs-zoom-out-button =
    .title = Kichiklashtirish
pdfjs-zoom-out-button-label = Kichiklashtirish
pdfjs-zoom-in-button =
    .title = Kattalashtirish
pdfjs-zoom-in-button-label = Kattalashtirish
pdfjs-zoom-select =
    .title = Masshtab
pdfjs-presentation-mode-button =
    .title = Namoyish usuliga oʻtish
pdfjs-presentation-mode-button-label = Namoyish usuli
pdfjs-open-file-button =
    .title = Faylni ochish
pdfjs-open-file-button-label = Ochish
pdfjs-print-button =
    .title = Chop qilish
pdfjs-print-button-label = Chop qilish

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Vositalar
pdfjs-tools-button-label = Vositalar
pdfjs-first-page-button =
    .title = Birinchi sahifaga oʻtish
pdfjs-first-page-button-label = Birinchi sahifaga oʻtish
pdfjs-last-page-button =
    .title = Soʻnggi sahifaga oʻtish
pdfjs-last-page-button-label = Soʻnggi sahifaga oʻtish
pdfjs-page-rotate-cw-button =
    .title = Soat yoʻnalishi boʻyicha burish
pdfjs-page-rotate-cw-button-label = Soat yoʻnalishi boʻyicha burish
pdfjs-page-rotate-ccw-button =
    .title = Soat yoʻnalishiga qarshi burish
pdfjs-page-rotate-ccw-button-label = Soat yoʻnalishiga qarshi burish

## Document properties dialog

pdfjs-document-properties-button =
    .title = Hujjat xossalari
pdfjs-document-properties-button-label = Hujjat xossalari
pdfjs-document-properties-file-name = Fayl nomi:
pdfjs-document-properties-file-size = Fayl hajmi:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Nomi:
pdfjs-document-properties-author = Muallifi:
pdfjs-document-properties-subject = Mavzusi:
pdfjs-document-properties-keywords = Kalit so‘zlar
pdfjs-document-properties-creation-date = Yaratilgan sanasi:
pdfjs-document-properties-modification-date = O‘zgartirilgan sanasi
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Yaratuvchi:
pdfjs-document-properties-producer = PDF ishlab chiqaruvchi:
pdfjs-document-properties-version = PDF versiyasi:
pdfjs-document-properties-page-count = Sahifa soni:

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page


##

pdfjs-document-properties-close-button = Yopish

## Print

pdfjs-printing-not-supported = Diqqat: chop qilish bruzer tomonidan toʻliq qoʻllab-quvvatlanmaydi.
pdfjs-printing-not-ready = Diqqat: PDF fayl chop qilish uchun toʻliq yuklanmadi.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Yon panelni yoqib/oʻchirib qoʻyish
pdfjs-toggle-sidebar-button-label = Yon panelni yoqib/oʻchirib qoʻyish
pdfjs-document-outline-button-label = Hujjat tuzilishi
pdfjs-attachments-button =
    .title = Ilovalarni ko‘rsatish
pdfjs-attachments-button-label = Ilovalar
pdfjs-thumbs-button =
    .title = Nishonchalarni koʻrsatish
pdfjs-thumbs-button-label = Nishoncha
pdfjs-findbar-button =
    .title = Hujjat ichidan topish

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = { $page } sahifa
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page } sahifa nishonchasi

## Find panel button title and messages

pdfjs-find-previous-button =
    .title = Soʻzlardagi oldingi hodisani topish
pdfjs-find-previous-button-label = Oldingi
pdfjs-find-next-button =
    .title = Iboradagi keyingi hodisani topish
pdfjs-find-next-button-label = Keyingi
pdfjs-find-highlight-checkbox = Barchasini ajratib koʻrsatish
pdfjs-find-match-case-checkbox-label = Katta-kichik harflarni farqlash
pdfjs-find-reached-top = Hujjatning boshigacha yetib keldik, pastdan davom ettiriladi
pdfjs-find-reached-bottom = Hujjatning oxiriga yetib kelindi, yuqoridan davom ettirladi
pdfjs-find-not-found = Soʻzlar topilmadi

## Predefined zoom values

pdfjs-page-scale-width = Sahifa eni
pdfjs-page-scale-fit = Sahifani moslashtirish
pdfjs-page-scale-auto = Avtomatik masshtab
pdfjs-page-scale-actual = Haqiqiy hajmi
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = PDF yuklanayotganda xato yuz berdi.
pdfjs-invalid-file-error = Xato yoki buzuq PDF fayli.
pdfjs-missing-file-error = PDF fayl kerak.
pdfjs-unexpected-response-error = Kutilmagan server javobi.
pdfjs-rendering-error = Sahifa renderlanayotganda xato yuz berdi.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } Annotation]

## Password

pdfjs-password-label = PDF faylni ochish uchun parolni kiriting.
pdfjs-password-invalid = Parol - notoʻgʻri. Qaytadan urinib koʻring.
pdfjs-password-ok-button = OK
pdfjs-web-fonts-disabled = Veb shriftlar oʻchirilgan: ichki PDF shriftlardan foydalanib boʻlmmaydi.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

