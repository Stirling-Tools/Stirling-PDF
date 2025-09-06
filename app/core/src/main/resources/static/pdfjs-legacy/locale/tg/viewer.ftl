# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Саҳифаи қаблӣ
pdfjs-previous-button-label = Қаблӣ
pdfjs-next-button =
    .title = Саҳифаи навбатӣ
pdfjs-next-button-label = Навбатӣ
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Саҳифа
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = аз { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } аз { $pagesCount })
pdfjs-zoom-out-button =
    .title = Хурд кардан
pdfjs-zoom-out-button-label = Хурд кардан
pdfjs-zoom-in-button =
    .title = Калон кардан
pdfjs-zoom-in-button-label = Калон кардан
pdfjs-zoom-select =
    .title = Танзими андоза
pdfjs-presentation-mode-button =
    .title = Гузариш ба реҷаи тақдим
pdfjs-presentation-mode-button-label = Реҷаи тақдим
pdfjs-open-file-button =
    .title = Кушодани файл
pdfjs-open-file-button-label = Кушодан
pdfjs-print-button =
    .title = Чоп кардан
pdfjs-print-button-label = Чоп кардан
pdfjs-save-button =
    .title = Нигоҳ доштан
pdfjs-save-button-label = Нигоҳ доштан
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Боргирӣ кардан
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Боргирӣ кардан
pdfjs-bookmark-button =
    .title = Саҳифаи ҷорӣ (Дидани нишонии URL аз саҳифаи ҷорӣ)
pdfjs-bookmark-button-label = Саҳифаи ҷорӣ

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Абзорҳо
pdfjs-tools-button-label = Абзорҳо
pdfjs-first-page-button =
    .title = Ба саҳифаи аввал гузаред
pdfjs-first-page-button-label = Ба саҳифаи аввал гузаред
pdfjs-last-page-button =
    .title = Ба саҳифаи охирин гузаред
pdfjs-last-page-button-label = Ба саҳифаи охирин гузаред
pdfjs-page-rotate-cw-button =
    .title = Ба самти ҳаракати ақрабаки соат давр задан
pdfjs-page-rotate-cw-button-label = Ба самти ҳаракати ақрабаки соат давр задан
pdfjs-page-rotate-ccw-button =
    .title = Ба муқобили самти ҳаракати ақрабаки соат давр задан
pdfjs-page-rotate-ccw-button-label = Ба муқобили самти ҳаракати ақрабаки соат давр задан
pdfjs-cursor-text-select-tool-button =
    .title = Фаъол кардани «Абзори интихоби матн»
pdfjs-cursor-text-select-tool-button-label = Абзори интихоби матн
pdfjs-cursor-hand-tool-button =
    .title = Фаъол кардани «Абзори даст»
pdfjs-cursor-hand-tool-button-label = Абзори даст
pdfjs-scroll-page-button =
    .title = Истифодаи варақзанӣ
pdfjs-scroll-page-button-label = Варақзанӣ
pdfjs-scroll-vertical-button =
    .title = Истифодаи варақзании амудӣ
pdfjs-scroll-vertical-button-label = Варақзании амудӣ
pdfjs-scroll-horizontal-button =
    .title = Истифодаи варақзании уфуқӣ
pdfjs-scroll-horizontal-button-label = Варақзании уфуқӣ
pdfjs-scroll-wrapped-button =
    .title = Истифодаи варақзании миқёсбандӣ
pdfjs-scroll-wrapped-button-label = Варақзании миқёсбандӣ
pdfjs-spread-none-button =
    .title = Густариши саҳифаҳо истифода бурда нашавад
pdfjs-spread-none-button-label = Бе густурдани саҳифаҳо
pdfjs-spread-odd-button =
    .title = Густариши саҳифаҳо аз саҳифаҳо бо рақамҳои тоқ оғоз карда мешавад
pdfjs-spread-odd-button-label = Саҳифаҳои тоқ аз тарафи чап
pdfjs-spread-even-button =
    .title = Густариши саҳифаҳо аз саҳифаҳо бо рақамҳои ҷуфт оғоз карда мешавад
pdfjs-spread-even-button-label = Саҳифаҳои ҷуфт аз тарафи чап

## Document properties dialog

pdfjs-document-properties-button =
    .title = Хусусиятҳои ҳуҷҷат…
pdfjs-document-properties-button-label = Хусусиятҳои ҳуҷҷат…
pdfjs-document-properties-file-name = Номи файл:
pdfjs-document-properties-file-size = Андозаи файл:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } КБ ({ $size_b } байт)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } МБ ({ $size_b } байт)
pdfjs-document-properties-title = Сарлавҳа:
pdfjs-document-properties-author = Муаллиф:
pdfjs-document-properties-subject = Мавзуъ:
pdfjs-document-properties-keywords = Калимаҳои калидӣ:
pdfjs-document-properties-creation-date = Санаи эҷод:
pdfjs-document-properties-modification-date = Санаи тағйирот:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Эҷодкунанда:
pdfjs-document-properties-producer = Таҳиякунандаи «PDF»:
pdfjs-document-properties-version = Версияи «PDF»:
pdfjs-document-properties-page-count = Шумораи саҳифаҳо:
pdfjs-document-properties-page-size = Андозаи саҳифа:
pdfjs-document-properties-page-size-unit-inches = дюйм
pdfjs-document-properties-page-size-unit-millimeters = мм
pdfjs-document-properties-page-size-orientation-portrait = амудӣ
pdfjs-document-properties-page-size-orientation-landscape = уфуқӣ
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Мактуб
pdfjs-document-properties-page-size-name-legal = Ҳуқуқӣ

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
pdfjs-document-properties-linearized = Намоиши тез дар Интернет:
pdfjs-document-properties-linearized-yes = Ҳа
pdfjs-document-properties-linearized-no = Не
pdfjs-document-properties-close-button = Пӯшидан

## Print

pdfjs-print-progress-message = Омодасозии ҳуҷҷат барои чоп…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Бекор кардан
pdfjs-printing-not-supported = Диққат: Чопкунӣ аз тарафи ин браузер ба таври пурра дастгирӣ намешавад.
pdfjs-printing-not-ready = Диққат: Файли «PDF» барои чопкунӣ пурра бор карда нашуд.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Фаъол кардани навори ҷонибӣ
pdfjs-toggle-sidebar-notification-button =
    .title = Фаъол кардани навори ҷонибӣ (ҳуҷҷат дорои сохтор/замимаҳо/қабатҳо мебошад)
pdfjs-toggle-sidebar-button-label = Фаъол кардани навори ҷонибӣ
pdfjs-document-outline-button =
    .title = Намоиш додани сохтори ҳуҷҷат (барои баркушодан/пеҷондани ҳамаи унсурҳо дубора зер кунед)
pdfjs-document-outline-button-label = Сохтори ҳуҷҷат
pdfjs-attachments-button =
    .title = Намоиш додани замимаҳо
pdfjs-attachments-button-label = Замимаҳо
pdfjs-layers-button =
    .title = Намоиш додани қабатҳо (барои барқарор кардани ҳамаи қабатҳо ба вазъияти пешфарз дубора зер кунед)
pdfjs-layers-button-label = Қабатҳо
pdfjs-thumbs-button =
    .title = Намоиш додани тасвирчаҳо
pdfjs-thumbs-button-label = Тасвирчаҳо
pdfjs-current-outline-item-button =
    .title = Ёфтани унсури сохтори ҷорӣ
pdfjs-current-outline-item-button-label = Унсури сохтори ҷорӣ
pdfjs-findbar-button =
    .title = Ёфтан дар ҳуҷҷат
pdfjs-findbar-button-label = Ёфтан
pdfjs-additional-layers = Қабатҳои иловагӣ

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Саҳифаи { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Тасвирчаи саҳифаи { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Ёфтан
    .placeholder = Ёфтан дар ҳуҷҷат…
pdfjs-find-previous-button =
    .title = Ҷустуҷӯи мавриди қаблии ибораи пешниҳодшуда
pdfjs-find-previous-button-label = Қаблӣ
pdfjs-find-next-button =
    .title = Ҷустуҷӯи мавриди навбатии ибораи пешниҳодшуда
pdfjs-find-next-button-label = Навбатӣ
pdfjs-find-highlight-checkbox = Ҳамаашро бо ранг ҷудо кардан
pdfjs-find-match-case-checkbox-label = Бо дарназардошти ҳарфҳои хурду калон
pdfjs-find-match-diacritics-checkbox-label = Бо дарназардошти аломатҳои диакритикӣ
pdfjs-find-entire-word-checkbox-label = Калимаҳои пурра
pdfjs-find-reached-top = Ба болои ҳуҷҷат расид, аз поён идома ёфт
pdfjs-find-reached-bottom = Ба поёни ҳуҷҷат расид, аз боло идома ёфт
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } аз { $total } мувофиқат
       *[other] { $current } аз { $total } мувофиқат
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Зиёда аз { $limit } мувофиқат
       *[other] Зиёда аз { $limit } мувофиқат
    }
pdfjs-find-not-found = Ибора ёфт нашуд

## Predefined zoom values

pdfjs-page-scale-width = Аз рӯи паҳнои саҳифа
pdfjs-page-scale-fit = Аз рӯи андозаи саҳифа
pdfjs-page-scale-auto = Андозаи худкор
pdfjs-page-scale-actual = Андозаи воқеӣ
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Саҳифаи { $page }

## Loading indicator messages

pdfjs-loading-error = Ҳангоми боркунии «PDF» хато ба миён омад.
pdfjs-invalid-file-error = Файли «PDF» нодуруст ё вайроншуда мебошад.
pdfjs-missing-file-error = Файли «PDF» ғоиб аст.
pdfjs-unexpected-response-error = Ҷавоби ногаҳон аз сервер.
pdfjs-rendering-error = Ҳангоми шаклсозии саҳифа хато ба миён омад.

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
    .alt = [Ҳошиянависӣ - { $type }]

## Password

pdfjs-password-label = Барои кушодани ин файли «PDF» ниҳонвожаро ворид кунед.
pdfjs-password-invalid = Ниҳонвожаи нодуруст. Лутфан, аз нав кӯшиш кунед.
pdfjs-password-ok-button = ХУБ
pdfjs-password-cancel-button = Бекор кардан
pdfjs-web-fonts-disabled = Шрифтҳои интернетӣ ғайрифаъоланд: истифодаи шрифтҳои дарунсохти «PDF» ғайриимкон аст.

## Editing

pdfjs-editor-free-text-button =
    .title = Матн
pdfjs-editor-free-text-button-label = Матн
pdfjs-editor-ink-button =
    .title = Расмкашӣ
pdfjs-editor-ink-button-label = Расмкашӣ
pdfjs-editor-stamp-button =
    .title = Илова ё таҳрир кардани тасвирҳо
pdfjs-editor-stamp-button-label = Илова ё таҳрир кардани тасвирҳо
pdfjs-editor-highlight-button =
    .title = Ҷудокунӣ
pdfjs-editor-highlight-button-label = Ҷудокунӣ
pdfjs-highlight-floating-button =
    .title = Ҷудокунӣ
pdfjs-highlight-floating-button1 =
    .title = Ҷудокунӣ
    .aria-label = Ҷудокунӣ
pdfjs-highlight-floating-button-label = Ҷудокунӣ

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Тоза кардани нақша
pdfjs-editor-remove-freetext-button =
    .title = Тоза кардани матн
pdfjs-editor-remove-stamp-button =
    .title = Тоза кардани тасвир
pdfjs-editor-remove-highlight-button =
    .title = Тоза кардани ҷудокунӣ

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Ранг
pdfjs-editor-free-text-size-input = Андоза
pdfjs-editor-ink-color-input = Ранг
pdfjs-editor-ink-thickness-input = Ғафсӣ
pdfjs-editor-ink-opacity-input = Шаффофӣ
pdfjs-editor-stamp-add-image-button =
    .title = Илова кардани тасвир
pdfjs-editor-stamp-add-image-button-label = Илова кардани тасвир
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Ғафсӣ
pdfjs-editor-free-highlight-thickness-title =
    .title = Иваз кардани ғафсӣ ҳангоми ҷудокунии унсурҳо ба ғайр аз матн
pdfjs-free-text =
    .aria-label = Муҳаррири матн
pdfjs-free-text-default-content = Нависед…
pdfjs-ink =
    .aria-label = Муҳаррири расмкашӣ
pdfjs-ink-canvas =
    .aria-label = Тасвири эҷодкардаи корбар

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Матни ивазкунанда
pdfjs-editor-alt-text-edit-button-label = Таҳрир кардани матни ивазкунанда
pdfjs-editor-alt-text-dialog-label = Имконеро интихоб намоед
pdfjs-editor-alt-text-dialog-description = Вақте ки одамон тасвирро дида наметавонанд ё вақте ки тасвир бор карда намешавад, матни иловагӣ (Alt text) кумак мерасонад.
pdfjs-editor-alt-text-add-description-label = Илова кардани тавсиф
pdfjs-editor-alt-text-add-description-description = Кӯшиш кунед, ки 1-2 ҷумлаеро нависед, ки ба мавзӯъ, танзим ё амалҳо тавзеҳ медиҳад.
pdfjs-editor-alt-text-mark-decorative-label = Гузоштан ҳамчун матни ороишӣ
pdfjs-editor-alt-text-mark-decorative-description = Ин барои тасвирҳои ороишӣ, ба монанди марзҳо ё аломатҳои обӣ, истифода мешавад.
pdfjs-editor-alt-text-cancel-button = Бекор кардан
pdfjs-editor-alt-text-save-button = Нигоҳ доштан
pdfjs-editor-alt-text-decorative-tooltip = Ҳамчун матни ороишӣ гузошта шуд
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Барои мисол, «Ман забони тоҷикиро дӯст медорам»

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Кунҷи чапи боло — тағйир додани андоза
pdfjs-editor-resizer-label-top-middle = Канори миёнаи боло — тағйир додани андоза
pdfjs-editor-resizer-label-top-right = Кунҷи рости боло — тағйир додани андоза
pdfjs-editor-resizer-label-middle-right = Канори миёнаи рост — тағйир додани андоза
pdfjs-editor-resizer-label-bottom-right = Кунҷи рости поён — тағйир додани андоза
pdfjs-editor-resizer-label-bottom-middle = Канори миёнаи поён — тағйир додани андоза
pdfjs-editor-resizer-label-bottom-left = Кунҷи чапи поён — тағйир додани андоза
pdfjs-editor-resizer-label-middle-left = Канори миёнаи чап — тағйир додани андоза

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Ранги ҷудокунӣ
pdfjs-editor-colorpicker-button =
    .title = Иваз кардани ранг
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Интихоби ранг
pdfjs-editor-colorpicker-yellow =
    .title = Зард
pdfjs-editor-colorpicker-green =
    .title = Сабз
pdfjs-editor-colorpicker-blue =
    .title = Кабуд
pdfjs-editor-colorpicker-pink =
    .title = Гулобӣ
pdfjs-editor-colorpicker-red =
    .title = Сурх

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Ҳамаро намоиш додан
pdfjs-editor-highlight-show-all-button =
    .title = Ҳамаро намоиш додан
