# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Алдыңғы парақ
pdfjs-previous-button-label = Алдыңғысы
pdfjs-next-button =
    .title = Келесі парақ
pdfjs-next-button-label = Келесі
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Парақ
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } ішінен
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = (парақ { $pageNumber }, { $pagesCount } ішінен)
pdfjs-zoom-out-button =
    .title = Кішірейту
pdfjs-zoom-out-button-label = Кішірейту
pdfjs-zoom-in-button =
    .title = Үлкейту
pdfjs-zoom-in-button-label = Үлкейту
pdfjs-zoom-select =
    .title = Масштаб
pdfjs-presentation-mode-button =
    .title = Презентация режиміне ауысу
pdfjs-presentation-mode-button-label = Презентация режимі
pdfjs-open-file-button =
    .title = Файлды ашу
pdfjs-open-file-button-label = Ашу
pdfjs-print-button =
    .title = Баспаға шығару
pdfjs-print-button-label = Баспаға шығару
pdfjs-save-button =
    .title = Сақтау
pdfjs-save-button-label = Сақтау
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Жүктеп алу
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Жүктеп алу
pdfjs-bookmark-button =
    .title = Ағымдағы бет (Ағымдағы беттен URL адресін көру)
pdfjs-bookmark-button-label = Ағымдағы бет
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Қолданбада ашу
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Қолданбада ашу

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Құралдар
pdfjs-tools-button-label = Құралдар
pdfjs-first-page-button =
    .title = Алғашқы параққа өту
pdfjs-first-page-button-label = Алғашқы параққа өту
pdfjs-last-page-button =
    .title = Соңғы параққа өту
pdfjs-last-page-button-label = Соңғы параққа өту
pdfjs-page-rotate-cw-button =
    .title = Сағат тілі бағытымен айналдыру
pdfjs-page-rotate-cw-button-label = Сағат тілі бағытымен бұру
pdfjs-page-rotate-ccw-button =
    .title = Сағат тілі бағытына қарсы бұру
pdfjs-page-rotate-ccw-button-label = Сағат тілі бағытына қарсы бұру
pdfjs-cursor-text-select-tool-button =
    .title = Мәтінді таңдау құралын іске қосу
pdfjs-cursor-text-select-tool-button-label = Мәтінді таңдау құралы
pdfjs-cursor-hand-tool-button =
    .title = Қол құралын іске қосу
pdfjs-cursor-hand-tool-button-label = Қол құралы
pdfjs-scroll-page-button =
    .title = Беттерді айналдыруды пайдалану
pdfjs-scroll-page-button-label = Беттерді айналдыру
pdfjs-scroll-vertical-button =
    .title = Вертикалды айналдыруды қолдану
pdfjs-scroll-vertical-button-label = Вертикалды айналдыру
pdfjs-scroll-horizontal-button =
    .title = Горизонталды айналдыруды қолдану
pdfjs-scroll-horizontal-button-label = Горизонталды айналдыру
pdfjs-scroll-wrapped-button =
    .title = Масштабталатын айналдыруды қолдану
pdfjs-scroll-wrapped-button-label = Масштабталатын айналдыру
pdfjs-spread-none-button =
    .title = Жазық беттер режимін қолданбау
pdfjs-spread-none-button-label = Жазық беттер режимсіз
pdfjs-spread-odd-button =
    .title = Жазық беттер тақ нөмірлі беттерден басталады
pdfjs-spread-odd-button-label = Тақ нөмірлі беттер сол жақтан
pdfjs-spread-even-button =
    .title = Жазық беттер жұп нөмірлі беттерден басталады
pdfjs-spread-even-button-label = Жұп нөмірлі беттер сол жақтан

## Document properties dialog

pdfjs-document-properties-button =
    .title = Құжат қасиеттері…
pdfjs-document-properties-button-label = Құжат қасиеттері…
pdfjs-document-properties-file-name = Файл аты:
pdfjs-document-properties-file-size = Файл өлшемі:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } КБ ({ $size_b } байт)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } МБ ({ $size_b } байт)
pdfjs-document-properties-title = Тақырыбы:
pdfjs-document-properties-author = Авторы:
pdfjs-document-properties-subject = Тақырыбы:
pdfjs-document-properties-keywords = Кілт сөздер:
pdfjs-document-properties-creation-date = Жасалған күні:
pdfjs-document-properties-modification-date = Түзету күні:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Жасаған:
pdfjs-document-properties-producer = PDF өндірген:
pdfjs-document-properties-version = PDF нұсқасы:
pdfjs-document-properties-page-count = Беттер саны:
pdfjs-document-properties-page-size = Бет өлшемі:
pdfjs-document-properties-page-size-unit-inches = дюйм
pdfjs-document-properties-page-size-unit-millimeters = мм
pdfjs-document-properties-page-size-orientation-portrait = тік
pdfjs-document-properties-page-size-orientation-landscape = жатық
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
pdfjs-document-properties-linearized = Жылдам Web көрінісі:
pdfjs-document-properties-linearized-yes = Иә
pdfjs-document-properties-linearized-no = Жоқ
pdfjs-document-properties-close-button = Жабу

## Print

pdfjs-print-progress-message = Құжатты баспаға шығару үшін дайындау…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Бас тарту
pdfjs-printing-not-supported = Ескерту: Баспаға шығаруды бұл браузер толығымен қолдамайды.
pdfjs-printing-not-ready = Ескерту: Баспаға шығару үшін, бұл PDF толығымен жүктеліп алынбады.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Бүйір панелін көрсету/жасыру
pdfjs-toggle-sidebar-notification-button =
    .title = Бүйір панелін көрсету/жасыру (құжатта құрылымы/салынымдар/қабаттар бар)
pdfjs-toggle-sidebar-button-label = Бүйір панелін көрсету/жасыру
pdfjs-document-outline-button =
    .title = Құжат құрылымын көрсету (барлық нәрселерді жазық қылу/жинау үшін қос шерту керек)
pdfjs-document-outline-button-label = Құжат құрамасы
pdfjs-attachments-button =
    .title = Салынымдарды көрсету
pdfjs-attachments-button-label = Салынымдар
pdfjs-layers-button =
    .title = Қабаттарды көрсету (барлық қабаттарды бастапқы күйге келтіру үшін екі рет шертіңіз)
pdfjs-layers-button-label = Қабаттар
pdfjs-thumbs-button =
    .title = Кіші көріністерді көрсету
pdfjs-thumbs-button-label = Кіші көріністер
pdfjs-current-outline-item-button =
    .title = Құрылымның ағымдағы элементін табу
pdfjs-current-outline-item-button-label = Құрылымның ағымдағы элементі
pdfjs-findbar-button =
    .title = Құжаттан табу
pdfjs-findbar-button-label = Табу
pdfjs-additional-layers = Қосымша қабаттар

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = { $page } парағы
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page } парағы үшін кіші көрінісі

## Find panel button title and messages

pdfjs-find-input =
    .title = Табу
    .placeholder = Құжаттан табу…
pdfjs-find-previous-button =
    .title = Осы сөздердің мәтіннен алдыңғы кездесуін табу
pdfjs-find-previous-button-label = Алдыңғысы
pdfjs-find-next-button =
    .title = Осы сөздердің мәтіннен келесі кездесуін табу
pdfjs-find-next-button-label = Келесі
pdfjs-find-highlight-checkbox = Барлығын түспен ерекшелеу
pdfjs-find-match-case-checkbox-label = Регистрді ескеру
pdfjs-find-match-diacritics-checkbox-label = Диакритиканы ескеру
pdfjs-find-entire-word-checkbox-label = Сөздер толығымен
pdfjs-find-reached-top = Құжаттың басына жеттік, соңынан бастап жалғастырамыз
pdfjs-find-reached-bottom = Құжаттың соңына жеттік, басынан бастап жалғастырамыз
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } сәйкестік, барлығы { $total }
       *[other] { $current } сәйкестік, барлығы { $total }
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] { $limit } сәйкестіктен көп
       *[other] { $limit } сәйкестіктен көп
    }
pdfjs-find-not-found = Сөз(дер) табылмады

## Predefined zoom values

pdfjs-page-scale-width = Парақ ені
pdfjs-page-scale-fit = Парақты сыйдыру
pdfjs-page-scale-auto = Автомасштабтау
pdfjs-page-scale-actual = Нақты өлшемі
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Бет { $page }

## Loading indicator messages

pdfjs-loading-error = PDF жүктеу кезінде қате кетті.
pdfjs-invalid-file-error = Зақымдалған немесе қате PDF файл.
pdfjs-missing-file-error = PDF файлы жоқ.
pdfjs-unexpected-response-error = Сервердің күтпеген жауабы.
pdfjs-rendering-error = Парақты өңдеу кезінде қате кетті.

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
    .alt = [{ $type } аңдатпасы]

## Password

pdfjs-password-label = Бұл PDF файлын ашу үшін парольді енгізіңіз.
pdfjs-password-invalid = Пароль дұрыс емес. Қайталап көріңіз.
pdfjs-password-ok-button = ОК
pdfjs-password-cancel-button = Бас тарту
pdfjs-web-fonts-disabled = Веб қаріптері сөндірілген: құрамына енгізілген PDF қаріптерін қолдану мүмкін емес.

## Editing

pdfjs-editor-free-text-button =
    .title = Мәтін
pdfjs-editor-free-text-button-label = Мәтін
pdfjs-editor-ink-button =
    .title = Сурет салу
pdfjs-editor-ink-button-label = Сурет салу
pdfjs-editor-stamp-button =
    .title = Суреттерді қосу немесе түзету
pdfjs-editor-stamp-button-label = Суреттерді қосу немесе түзету
pdfjs-editor-highlight-button =
    .title = Ерекшелеу
pdfjs-editor-highlight-button-label = Ерекшелеу
pdfjs-highlight-floating-button =
    .title = Ерекшелеу
pdfjs-highlight-floating-button1 =
    .title = Ерекшелеу
    .aria-label = Ерекшелеу
pdfjs-highlight-floating-button-label = Ерекшелеу

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Сызбаны өшіру
pdfjs-editor-remove-freetext-button =
    .title = Мәтінді өшіру
pdfjs-editor-remove-stamp-button =
    .title = Суретті өшіру
pdfjs-editor-remove-highlight-button =
    .title = Түспен ерекшелеуді өшіру

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Түс
pdfjs-editor-free-text-size-input = Өлшемі
pdfjs-editor-ink-color-input = Түс
pdfjs-editor-ink-thickness-input = Қалыңдығы
pdfjs-editor-ink-opacity-input = Мөлдірсіздігі
pdfjs-editor-stamp-add-image-button =
    .title = Суретті қосу
pdfjs-editor-stamp-add-image-button-label = Суретті қосу
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Қалыңдығы
pdfjs-editor-free-highlight-thickness-title =
    .title = Мәтіннен басқа элементтерді ерекшелеу кезінде қалыңдықты өзгерту
pdfjs-free-text =
    .aria-label = Мәтін түзеткіші
pdfjs-free-text-default-content = Теруді бастау…
pdfjs-ink =
    .aria-label = Сурет түзеткіші
pdfjs-ink-canvas =
    .aria-label = Пайдаланушы жасаған сурет

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Балама мәтін
pdfjs-editor-alt-text-edit-button-label = Балама мәтінді өңдеу
pdfjs-editor-alt-text-dialog-label = Опцияны таңдау
pdfjs-editor-alt-text-dialog-description = Балама мәтін адамдар суретті көре алмағанда немесе ол жүктелмегенде көмектеседі.
pdfjs-editor-alt-text-add-description-label = Сипаттаманы қосу
pdfjs-editor-alt-text-add-description-description = Тақырыпты, баптауды немесе әрекетті сипаттайтын 1-2 сөйлемді қолдануға тырысыңыз.
pdfjs-editor-alt-text-mark-decorative-label = Декоративті деп белгілеу
pdfjs-editor-alt-text-mark-decorative-description = Бұл жиектер немесе су белгілері сияқты оюлық суреттер үшін пайдаланылады.
pdfjs-editor-alt-text-cancel-button = Бас тарту
pdfjs-editor-alt-text-save-button = Сақтау
pdfjs-editor-alt-text-decorative-tooltip = Декоративті деп белгіленген
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Мысалы, "Жас жігіт тамақ ішу үшін үстел басына отырады"

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Жоғарғы сол жақ бұрыш — өлшемін өзгерту
pdfjs-editor-resizer-label-top-middle = Жоғарғы ортасы — өлшемін өзгерту
pdfjs-editor-resizer-label-top-right = Жоғарғы оң жақ бұрыш — өлшемін өзгерту
pdfjs-editor-resizer-label-middle-right = Ортаңғы оң жақ — өлшемін өзгерту
pdfjs-editor-resizer-label-bottom-right = Төменгі оң жақ бұрыш — өлшемін өзгерту
pdfjs-editor-resizer-label-bottom-middle = Төменгі ортасы — өлшемін өзгерту
pdfjs-editor-resizer-label-bottom-left = Төменгі сол жақ бұрыш — өлшемін өзгерту
pdfjs-editor-resizer-label-middle-left = Ортаңғы сол жақ — өлшемін өзгерту

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Ерекшелеу түсі
pdfjs-editor-colorpicker-button =
    .title = Түсті өзгерту
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Түс таңдаулары
pdfjs-editor-colorpicker-yellow =
    .title = Сары
pdfjs-editor-colorpicker-green =
    .title = Жасыл
pdfjs-editor-colorpicker-blue =
    .title = Көк
pdfjs-editor-colorpicker-pink =
    .title = Қызғылт
pdfjs-editor-colorpicker-red =
    .title = Қызыл

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Барлығын көрсету
pdfjs-editor-highlight-show-all-button =
    .title = Барлығын көрсету
