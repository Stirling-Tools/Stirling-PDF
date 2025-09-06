# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Претходна страница
pdfjs-previous-button-label = Претходна
pdfjs-next-button =
    .title = Следна страница
pdfjs-next-button-label = Следна
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Страница
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = од { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } од { $pagesCount })
pdfjs-zoom-out-button =
    .title = Намалување
pdfjs-zoom-out-button-label = Намали
pdfjs-zoom-in-button =
    .title = Зголемување
pdfjs-zoom-in-button-label = Зголеми
pdfjs-zoom-select =
    .title = Променување на големина
pdfjs-presentation-mode-button =
    .title = Премини во презентациски режим
pdfjs-presentation-mode-button-label = Презентациски режим
pdfjs-open-file-button =
    .title = Отворање датотека
pdfjs-open-file-button-label = Отвори
pdfjs-print-button =
    .title = Печатење
pdfjs-print-button-label = Печати

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Алатки
pdfjs-tools-button-label = Алатки
pdfjs-first-page-button =
    .title = Оди до првата страница
pdfjs-first-page-button-label = Оди до првата страница
pdfjs-last-page-button =
    .title = Оди до последната страница
pdfjs-last-page-button-label = Оди до последната страница
pdfjs-page-rotate-cw-button =
    .title = Ротирај по стрелките на часовникот
pdfjs-page-rotate-cw-button-label = Ротирај по стрелките на часовникот
pdfjs-page-rotate-ccw-button =
    .title = Ротирај спротивно од стрелките на часовникот
pdfjs-page-rotate-ccw-button-label = Ротирај спротивно од стрелките на часовникот
pdfjs-cursor-text-select-tool-button =
    .title = Овозможи алатка за избор на текст
pdfjs-cursor-text-select-tool-button-label = Алатка за избор на текст

## Document properties dialog

pdfjs-document-properties-button =
    .title = Својства на документот…
pdfjs-document-properties-button-label = Својства на документот…
pdfjs-document-properties-file-name = Име на датотека:
pdfjs-document-properties-file-size = Големина на датотеката:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } КБ ({ $size_b } бајти)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } МБ ({ $size_b } бајти)
pdfjs-document-properties-title = Наслов:
pdfjs-document-properties-author = Автор:
pdfjs-document-properties-subject = Тема:
pdfjs-document-properties-keywords = Клучни зборови:
pdfjs-document-properties-creation-date = Датум на создавање:
pdfjs-document-properties-modification-date = Датум на промена:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Креатор:
pdfjs-document-properties-version = Верзија на PDF:
pdfjs-document-properties-page-count = Број на страници:
pdfjs-document-properties-page-size = Големина на страница:
pdfjs-document-properties-page-size-unit-inches = инч
pdfjs-document-properties-page-size-unit-millimeters = мм
pdfjs-document-properties-page-size-orientation-portrait = портрет
pdfjs-document-properties-page-size-orientation-landscape = пејзаж
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Писмо

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

pdfjs-document-properties-linearized-yes = Да
pdfjs-document-properties-linearized-no = Не
pdfjs-document-properties-close-button = Затвори

## Print

pdfjs-print-progress-message = Документ се подготвува за печатење…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Откажи
pdfjs-printing-not-supported = Предупредување: Печатењето не е целосно поддржано во овој прелистувач.
pdfjs-printing-not-ready = Предупредување: PDF документот не е целосно вчитан за печатење.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Вклучи странична лента
pdfjs-toggle-sidebar-button-label = Вклучи странична лента
pdfjs-document-outline-button-label = Содржина на документот
pdfjs-attachments-button =
    .title = Прикажи додатоци
pdfjs-thumbs-button =
    .title = Прикажување на икони
pdfjs-thumbs-button-label = Икони
pdfjs-findbar-button =
    .title = Најди во документот
pdfjs-findbar-button-label = Најди

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Страница { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Икона од страница { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Пронајди
    .placeholder = Пронајди во документот…
pdfjs-find-previous-button =
    .title = Најди ја предходната појава на фразата
pdfjs-find-previous-button-label = Претходно
pdfjs-find-next-button =
    .title = Најди ја следната појава на фразата
pdfjs-find-next-button-label = Следно
pdfjs-find-highlight-checkbox = Означи сѐ
pdfjs-find-match-case-checkbox-label = Токму така
pdfjs-find-entire-word-checkbox-label = Цели зборови
pdfjs-find-reached-top = Барањето стигна до почетокот на документот и почнува од крајот
pdfjs-find-reached-bottom = Барањето стигна до крајот на документот и почнува од почеток
pdfjs-find-not-found = Фразата не е пронајдена

## Predefined zoom values

pdfjs-page-scale-width = Ширина на страница
pdfjs-page-scale-fit = Цела страница
pdfjs-page-scale-auto = Автоматска големина
pdfjs-page-scale-actual = Вистинска големина
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = Настана грешка при вчитувањето на PDF-от.
pdfjs-invalid-file-error = Невалидна или корумпирана PDF датотека.
pdfjs-missing-file-error = Недостасува PDF документ.
pdfjs-unexpected-response-error = Неочекуван одговор од серверот.
pdfjs-rendering-error = Настана грешка при прикажувањето на страницата.

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date }, { $time }

## Password

pdfjs-password-label = Внесете ја лозинката за да ја отворите оваа датотека.
pdfjs-password-invalid = Невалидна лозинка. Обидете се повторно.
pdfjs-password-ok-button = Во ред
pdfjs-password-cancel-button = Откажи
pdfjs-web-fonts-disabled = Интернет фонтовите се оневозможени: не може да се користат вградените PDF фонтови.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

