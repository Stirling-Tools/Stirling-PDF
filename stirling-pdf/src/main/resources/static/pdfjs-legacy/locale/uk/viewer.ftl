# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Попередня сторінка
pdfjs-previous-button-label = Попередня
pdfjs-next-button =
    .title = Наступна сторінка
pdfjs-next-button-label = Наступна
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Сторінка
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = із { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } із { $pagesCount })
pdfjs-zoom-out-button =
    .title = Зменшити
pdfjs-zoom-out-button-label = Зменшити
pdfjs-zoom-in-button =
    .title = Збільшити
pdfjs-zoom-in-button-label = Збільшити
pdfjs-zoom-select =
    .title = Масштаб
pdfjs-presentation-mode-button =
    .title = Перейти в режим презентації
pdfjs-presentation-mode-button-label = Режим презентації
pdfjs-open-file-button =
    .title = Відкрити файл
pdfjs-open-file-button-label = Відкрити
pdfjs-print-button =
    .title = Друк
pdfjs-print-button-label = Друк
pdfjs-save-button =
    .title = Зберегти
pdfjs-save-button-label = Зберегти
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Завантажити
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Завантажити
pdfjs-bookmark-button =
    .title = Поточна сторінка (перегляд URL-адреси з поточної сторінки)
pdfjs-bookmark-button-label = Поточна сторінка

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Інструменти
pdfjs-tools-button-label = Інструменти
pdfjs-first-page-button =
    .title = На першу сторінку
pdfjs-first-page-button-label = На першу сторінку
pdfjs-last-page-button =
    .title = На останню сторінку
pdfjs-last-page-button-label = На останню сторінку
pdfjs-page-rotate-cw-button =
    .title = Повернути за годинниковою стрілкою
pdfjs-page-rotate-cw-button-label = Повернути за годинниковою стрілкою
pdfjs-page-rotate-ccw-button =
    .title = Повернути проти годинникової стрілки
pdfjs-page-rotate-ccw-button-label = Повернути проти годинникової стрілки
pdfjs-cursor-text-select-tool-button =
    .title = Увімкнути інструмент вибору тексту
pdfjs-cursor-text-select-tool-button-label = Інструмент вибору тексту
pdfjs-cursor-hand-tool-button =
    .title = Увімкнути інструмент "Рука"
pdfjs-cursor-hand-tool-button-label = Інструмент "Рука"
pdfjs-scroll-page-button =
    .title = Використовувати прокручування сторінки
pdfjs-scroll-page-button-label = Прокручування сторінки
pdfjs-scroll-vertical-button =
    .title = Використовувати вертикальне прокручування
pdfjs-scroll-vertical-button-label = Вертикальне прокручування
pdfjs-scroll-horizontal-button =
    .title = Використовувати горизонтальне прокручування
pdfjs-scroll-horizontal-button-label = Горизонтальне прокручування
pdfjs-scroll-wrapped-button =
    .title = Використовувати масштабоване прокручування
pdfjs-scroll-wrapped-button-label = Масштабоване прокручування
pdfjs-spread-none-button =
    .title = Не використовувати розгорнуті сторінки
pdfjs-spread-none-button-label = Без розгорнутих сторінок
pdfjs-spread-odd-button =
    .title = Розгорнуті сторінки починаються з непарних номерів
pdfjs-spread-odd-button-label = Непарні сторінки зліва
pdfjs-spread-even-button =
    .title = Розгорнуті сторінки починаються з парних номерів
pdfjs-spread-even-button-label = Парні сторінки зліва

## Document properties dialog

pdfjs-document-properties-button =
    .title = Властивості документа…
pdfjs-document-properties-button-label = Властивості документа…
pdfjs-document-properties-file-name = Назва файлу:
pdfjs-document-properties-file-size = Розмір файлу:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } КБ ({ $size_b } байтів)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } МБ ({ $size_b } байтів)
pdfjs-document-properties-title = Заголовок:
pdfjs-document-properties-author = Автор:
pdfjs-document-properties-subject = Тема:
pdfjs-document-properties-keywords = Ключові слова:
pdfjs-document-properties-creation-date = Дата створення:
pdfjs-document-properties-modification-date = Дата зміни:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Створено:
pdfjs-document-properties-producer = Виробник PDF:
pdfjs-document-properties-version = Версія PDF:
pdfjs-document-properties-page-count = Кількість сторінок:
pdfjs-document-properties-page-size = Розмір сторінки:
pdfjs-document-properties-page-size-unit-inches = дюймів
pdfjs-document-properties-page-size-unit-millimeters = мм
pdfjs-document-properties-page-size-orientation-portrait = книжкова
pdfjs-document-properties-page-size-orientation-landscape = альбомна
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
pdfjs-document-properties-linearized = Швидкий перегляд в Інтернеті:
pdfjs-document-properties-linearized-yes = Так
pdfjs-document-properties-linearized-no = Ні
pdfjs-document-properties-close-button = Закрити

## Print

pdfjs-print-progress-message = Підготовка документу до друку…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Скасувати
pdfjs-printing-not-supported = Попередження: Цей браузер не повністю підтримує друк.
pdfjs-printing-not-ready = Попередження: PDF не повністю завантажений для друку.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Бічна панель
pdfjs-toggle-sidebar-notification-button =
    .title = Перемкнути бічну панель (документ містить ескіз/вкладення/шари)
pdfjs-toggle-sidebar-button-label = Перемкнути бічну панель
pdfjs-document-outline-button =
    .title = Показати схему документу (подвійний клік для розгортання/згортання елементів)
pdfjs-document-outline-button-label = Схема документа
pdfjs-attachments-button =
    .title = Показати вкладення
pdfjs-attachments-button-label = Вкладення
pdfjs-layers-button =
    .title = Показати шари (двічі клацніть, щоб скинути всі шари до типового стану)
pdfjs-layers-button-label = Шари
pdfjs-thumbs-button =
    .title = Показати мініатюри
pdfjs-thumbs-button-label = Мініатюри
pdfjs-current-outline-item-button =
    .title = Знайти поточний елемент змісту
pdfjs-current-outline-item-button-label = Поточний елемент змісту
pdfjs-findbar-button =
    .title = Знайти в документі
pdfjs-findbar-button-label = Знайти
pdfjs-additional-layers = Додаткові шари

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Сторінка { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Ескіз сторінки { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Знайти
    .placeholder = Знайти в документі…
pdfjs-find-previous-button =
    .title = Знайти попереднє входження фрази
pdfjs-find-previous-button-label = Попереднє
pdfjs-find-next-button =
    .title = Знайти наступне входження фрази
pdfjs-find-next-button-label = Наступне
pdfjs-find-highlight-checkbox = Підсвітити все
pdfjs-find-match-case-checkbox-label = З урахуванням регістру
pdfjs-find-match-diacritics-checkbox-label = Відповідність діакритичних знаків
pdfjs-find-entire-word-checkbox-label = Цілі слова
pdfjs-find-reached-top = Досягнуто початку документу, продовжено з кінця
pdfjs-find-reached-bottom = Досягнуто кінця документу, продовжено з початку
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } збіг з { $total }
        [few] { $current } збіги з { $total }
       *[many] { $current } збігів з { $total }
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Понад { $limit } збіг
        [few] Понад { $limit } збіги
       *[many] Понад { $limit } збігів
    }
pdfjs-find-not-found = Фразу не знайдено

## Predefined zoom values

pdfjs-page-scale-width = За шириною
pdfjs-page-scale-fit = Вмістити
pdfjs-page-scale-auto = Автомасштаб
pdfjs-page-scale-actual = Дійсний розмір
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Сторінка { $page }

## Loading indicator messages

pdfjs-loading-error = Під час завантаження PDF сталася помилка.
pdfjs-invalid-file-error = Недійсний або пошкоджений PDF-файл.
pdfjs-missing-file-error = Відсутній PDF-файл.
pdfjs-unexpected-response-error = Неочікувана відповідь сервера.
pdfjs-rendering-error = Під час виведення сторінки сталася помилка.

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
    .alt = [{ $type }-анотація]

## Password

pdfjs-password-label = Введіть пароль для відкриття цього PDF-файлу.
pdfjs-password-invalid = Неправильний пароль. Спробуйте ще раз.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Скасувати
pdfjs-web-fonts-disabled = Веб-шрифти вимкнено: неможливо використати вбудовані у PDF шрифти.

## Editing

pdfjs-editor-free-text-button =
    .title = Текст
pdfjs-editor-free-text-button-label = Текст
pdfjs-editor-ink-button =
    .title = Малювати
pdfjs-editor-ink-button-label = Малювати
pdfjs-editor-stamp-button =
    .title = Додати чи редагувати зображення
pdfjs-editor-stamp-button-label = Додати чи редагувати зображення
pdfjs-editor-highlight-button =
    .title = Підсвітити
pdfjs-editor-highlight-button-label = Підсвітити
pdfjs-highlight-floating-button =
    .title = Підсвітити
pdfjs-highlight-floating-button1 =
    .title = Підсвітити
    .aria-label = Підсвітити
pdfjs-highlight-floating-button-label = Підсвітити

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Вилучити малюнок
pdfjs-editor-remove-freetext-button =
    .title = Вилучити текст
pdfjs-editor-remove-stamp-button =
    .title = Вилучити зображення
pdfjs-editor-remove-highlight-button =
    .title = Вилучити підсвічування

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Колір
pdfjs-editor-free-text-size-input = Розмір
pdfjs-editor-ink-color-input = Колір
pdfjs-editor-ink-thickness-input = Товщина
pdfjs-editor-ink-opacity-input = Прозорість
pdfjs-editor-stamp-add-image-button =
    .title = Додати зображення
pdfjs-editor-stamp-add-image-button-label = Додати зображення
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Товщина
pdfjs-editor-free-highlight-thickness-title =
    .title = Змінюйте товщину під час підсвічування елементів, крім тексту
pdfjs-free-text =
    .aria-label = Текстовий редактор
pdfjs-free-text-default-content = Почніть вводити…
pdfjs-ink =
    .aria-label = Графічний редактор
pdfjs-ink-canvas =
    .aria-label = Зображення, створене користувачем

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Альтернативний текст
pdfjs-editor-alt-text-edit-button-label = Змінити альтернативний текст
pdfjs-editor-alt-text-dialog-label = Вибрати варіант
pdfjs-editor-alt-text-dialog-description = Альтернативний текст допомагає, коли зображення не видно або коли воно не завантажується.
pdfjs-editor-alt-text-add-description-label = Додати опис
pdfjs-editor-alt-text-add-description-description = Намагайтеся створити 1-2 речення, які описують тему, обставини або дії.
pdfjs-editor-alt-text-mark-decorative-label = Позначити декоративним
pdfjs-editor-alt-text-mark-decorative-description = Використовується для декоративних зображень, наприклад рамок або водяних знаків.
pdfjs-editor-alt-text-cancel-button = Скасувати
pdfjs-editor-alt-text-save-button = Зберегти
pdfjs-editor-alt-text-decorative-tooltip = Позначено декоративним
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Наприклад, “Молодий чоловік сідає за стіл їсти”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Верхній лівий кут – зміна розміру
pdfjs-editor-resizer-label-top-middle = Вгорі посередині – зміна розміру
pdfjs-editor-resizer-label-top-right = Верхній правий кут – зміна розміру
pdfjs-editor-resizer-label-middle-right = Праворуч посередині – зміна розміру
pdfjs-editor-resizer-label-bottom-right = Нижній правий кут – зміна розміру
pdfjs-editor-resizer-label-bottom-middle = Внизу посередині – зміна розміру
pdfjs-editor-resizer-label-bottom-left = Нижній лівий кут – зміна розміру
pdfjs-editor-resizer-label-middle-left = Ліворуч посередині – зміна розміру

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Колір підсвічування
pdfjs-editor-colorpicker-button =
    .title = Змінити колір
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Вибір кольору
pdfjs-editor-colorpicker-yellow =
    .title = Жовтий
pdfjs-editor-colorpicker-green =
    .title = Зелений
pdfjs-editor-colorpicker-blue =
    .title = Блакитний
pdfjs-editor-colorpicker-pink =
    .title = Рожевий
pdfjs-editor-colorpicker-red =
    .title = Червоний

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Показати все
pdfjs-editor-highlight-show-all-button =
    .title = Показати все
