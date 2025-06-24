# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Предыдущая страница
pdfjs-previous-button-label = Предыдущая
pdfjs-next-button =
    .title = Следующая страница
pdfjs-next-button-label = Следующая
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Страница
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = из { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } из { $pagesCount })
pdfjs-zoom-out-button =
    .title = Уменьшить
pdfjs-zoom-out-button-label = Уменьшить
pdfjs-zoom-in-button =
    .title = Увеличить
pdfjs-zoom-in-button-label = Увеличить
pdfjs-zoom-select =
    .title = Масштаб
pdfjs-presentation-mode-button =
    .title = Перейти в режим презентации
pdfjs-presentation-mode-button-label = Режим презентации
pdfjs-open-file-button =
    .title = Открыть файл
pdfjs-open-file-button-label = Открыть
pdfjs-print-button =
    .title = Печать
pdfjs-print-button-label = Печать
pdfjs-save-button =
    .title = Сохранить
pdfjs-save-button-label = Сохранить
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Загрузить
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Загрузить
pdfjs-bookmark-button =
    .title = Текущая страница (просмотр URL-адреса с текущей страницы)
pdfjs-bookmark-button-label = Текущая страница
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Открыть в приложении
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Открыть в программе

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Инструменты
pdfjs-tools-button-label = Инструменты
pdfjs-first-page-button =
    .title = Перейти на первую страницу
pdfjs-first-page-button-label = Перейти на первую страницу
pdfjs-last-page-button =
    .title = Перейти на последнюю страницу
pdfjs-last-page-button-label = Перейти на последнюю страницу
pdfjs-page-rotate-cw-button =
    .title = Повернуть по часовой стрелке
pdfjs-page-rotate-cw-button-label = Повернуть по часовой стрелке
pdfjs-page-rotate-ccw-button =
    .title = Повернуть против часовой стрелки
pdfjs-page-rotate-ccw-button-label = Повернуть против часовой стрелки
pdfjs-cursor-text-select-tool-button =
    .title = Включить Инструмент «Выделение текста»
pdfjs-cursor-text-select-tool-button-label = Инструмент «Выделение текста»
pdfjs-cursor-hand-tool-button =
    .title = Включить Инструмент «Рука»
pdfjs-cursor-hand-tool-button-label = Инструмент «Рука»
pdfjs-scroll-page-button =
    .title = Использовать прокрутку страниц
pdfjs-scroll-page-button-label = Прокрутка страниц
pdfjs-scroll-vertical-button =
    .title = Использовать вертикальную прокрутку
pdfjs-scroll-vertical-button-label = Вертикальная прокрутка
pdfjs-scroll-horizontal-button =
    .title = Использовать горизонтальную прокрутку
pdfjs-scroll-horizontal-button-label = Горизонтальная прокрутка
pdfjs-scroll-wrapped-button =
    .title = Использовать масштабируемую прокрутку
pdfjs-scroll-wrapped-button-label = Масштабируемая прокрутка
pdfjs-spread-none-button =
    .title = Не использовать режим разворотов страниц
pdfjs-spread-none-button-label = Без разворотов страниц
pdfjs-spread-odd-button =
    .title = Развороты начинаются с нечётных номеров страниц
pdfjs-spread-odd-button-label = Нечётные страницы слева
pdfjs-spread-even-button =
    .title = Развороты начинаются с чётных номеров страниц
pdfjs-spread-even-button-label = Чётные страницы слева

## Document properties dialog

pdfjs-document-properties-button =
    .title = Свойства документа…
pdfjs-document-properties-button-label = Свойства документа…
pdfjs-document-properties-file-name = Имя файла:
pdfjs-document-properties-file-size = Размер файла:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } КБ ({ $size_b } байт)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } МБ ({ $size_b } байт)
pdfjs-document-properties-title = Заголовок:
pdfjs-document-properties-author = Автор:
pdfjs-document-properties-subject = Тема:
pdfjs-document-properties-keywords = Ключевые слова:
pdfjs-document-properties-creation-date = Дата создания:
pdfjs-document-properties-modification-date = Дата изменения:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Приложение:
pdfjs-document-properties-producer = Производитель PDF:
pdfjs-document-properties-version = Версия PDF:
pdfjs-document-properties-page-count = Число страниц:
pdfjs-document-properties-page-size = Размер страницы:
pdfjs-document-properties-page-size-unit-inches = дюймов
pdfjs-document-properties-page-size-unit-millimeters = мм
pdfjs-document-properties-page-size-orientation-portrait = книжная
pdfjs-document-properties-page-size-orientation-landscape = альбомная
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
pdfjs-document-properties-linearized = Быстрый просмотр в Web:
pdfjs-document-properties-linearized-yes = Да
pdfjs-document-properties-linearized-no = Нет
pdfjs-document-properties-close-button = Закрыть

## Print

pdfjs-print-progress-message = Подготовка документа к печати…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Отмена
pdfjs-printing-not-supported = Предупреждение: В этом браузере не полностью поддерживается печать.
pdfjs-printing-not-ready = Предупреждение: PDF не полностью загружен для печати.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Показать/скрыть боковую панель
pdfjs-toggle-sidebar-notification-button =
    .title = Показать/скрыть боковую панель (документ имеет содержание/вложения/слои)
pdfjs-toggle-sidebar-button-label = Показать/скрыть боковую панель
pdfjs-document-outline-button =
    .title = Показать содержание документа (двойной щелчок, чтобы развернуть/свернуть все элементы)
pdfjs-document-outline-button-label = Содержание документа
pdfjs-attachments-button =
    .title = Показать вложения
pdfjs-attachments-button-label = Вложения
pdfjs-layers-button =
    .title = Показать слои (дважды щёлкните, чтобы сбросить все слои к состоянию по умолчанию)
pdfjs-layers-button-label = Слои
pdfjs-thumbs-button =
    .title = Показать миниатюры
pdfjs-thumbs-button-label = Миниатюры
pdfjs-current-outline-item-button =
    .title = Найти текущий элемент структуры
pdfjs-current-outline-item-button-label = Текущий элемент структуры
pdfjs-findbar-button =
    .title = Найти в документе
pdfjs-findbar-button-label = Найти
pdfjs-additional-layers = Дополнительные слои

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Страница { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Миниатюра страницы { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Найти
    .placeholder = Найти в документе…
pdfjs-find-previous-button =
    .title = Найти предыдущее вхождение фразы в текст
pdfjs-find-previous-button-label = Назад
pdfjs-find-next-button =
    .title = Найти следующее вхождение фразы в текст
pdfjs-find-next-button-label = Далее
pdfjs-find-highlight-checkbox = Подсветить все
pdfjs-find-match-case-checkbox-label = С учётом регистра
pdfjs-find-match-diacritics-checkbox-label = С учётом диакритических знаков
pdfjs-find-entire-word-checkbox-label = Слова целиком
pdfjs-find-reached-top = Достигнут верх документа, продолжено снизу
pdfjs-find-reached-bottom = Достигнут конец документа, продолжено сверху
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } из { $total } совпадения
        [few] { $current } из { $total } совпадений
       *[many] { $current } из { $total } совпадений
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Более { $limit } совпадения
        [few] Более { $limit } совпадений
       *[many] Более { $limit } совпадений
    }
pdfjs-find-not-found = Фраза не найдена

## Predefined zoom values

pdfjs-page-scale-width = По ширине страницы
pdfjs-page-scale-fit = По размеру страницы
pdfjs-page-scale-auto = Автоматически
pdfjs-page-scale-actual = Реальный размер
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Страница { $page }

## Loading indicator messages

pdfjs-loading-error = При загрузке PDF произошла ошибка.
pdfjs-invalid-file-error = Некорректный или повреждённый PDF-файл.
pdfjs-missing-file-error = PDF-файл отсутствует.
pdfjs-unexpected-response-error = Неожиданный ответ сервера.
pdfjs-rendering-error = При создании страницы произошла ошибка.

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
    .alt = [Аннотация { $type }]

## Password

pdfjs-password-label = Введите пароль, чтобы открыть этот PDF-файл.
pdfjs-password-invalid = Неверный пароль. Пожалуйста, попробуйте снова.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Отмена
pdfjs-web-fonts-disabled = Веб-шрифты отключены: не удалось задействовать встроенные PDF-шрифты.

## Editing

pdfjs-editor-free-text-button =
    .title = Текст
pdfjs-editor-free-text-button-label = Текст
pdfjs-editor-ink-button =
    .title = Рисовать
pdfjs-editor-ink-button-label = Рисовать
pdfjs-editor-stamp-button =
    .title = Добавить или изменить изображения
pdfjs-editor-stamp-button-label = Добавить или изменить изображения
pdfjs-editor-highlight-button =
    .title = Выделение
pdfjs-editor-highlight-button-label = Выделение
pdfjs-highlight-floating-button =
    .title = Выделение
pdfjs-highlight-floating-button1 =
    .title = Выделение
    .aria-label = Выделение
pdfjs-highlight-floating-button-label = Выделение

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Удалить рисунок
pdfjs-editor-remove-freetext-button =
    .title = Удалить текст
pdfjs-editor-remove-stamp-button =
    .title = Удалить изображение
pdfjs-editor-remove-highlight-button =
    .title = Удалить выделение

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Цвет
pdfjs-editor-free-text-size-input = Размер
pdfjs-editor-ink-color-input = Цвет
pdfjs-editor-ink-thickness-input = Толщина
pdfjs-editor-ink-opacity-input = Прозрачность
pdfjs-editor-stamp-add-image-button =
    .title = Добавить изображение
pdfjs-editor-stamp-add-image-button-label = Добавить изображение
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Толщина
pdfjs-editor-free-highlight-thickness-title =
    .title = Изменить толщину при выделении элементов, кроме текста
pdfjs-free-text =
    .aria-label = Текстовый редактор
pdfjs-free-text-default-content = Начните вводить…
pdfjs-ink =
    .aria-label = Редактор рисования
pdfjs-ink-canvas =
    .aria-label = Созданное пользователем изображение

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Альтернативный текст
pdfjs-editor-alt-text-edit-button-label = Изменить альтернативный текст
pdfjs-editor-alt-text-dialog-label = Выберите вариант
pdfjs-editor-alt-text-dialog-description = Альтернативный текст помогает, когда люди не видят изображение или оно не загружается.
pdfjs-editor-alt-text-add-description-label = Добавить описание
pdfjs-editor-alt-text-add-description-description = Старайтесь составлять 1–2 предложения, описывающих предмет, обстановку или действия.
pdfjs-editor-alt-text-mark-decorative-label = Отметить как декоративное
pdfjs-editor-alt-text-mark-decorative-description = Используется для декоративных изображений, таких как рамки или водяные знаки.
pdfjs-editor-alt-text-cancel-button = Отменить
pdfjs-editor-alt-text-save-button = Сохранить
pdfjs-editor-alt-text-decorative-tooltip = Помечен как декоративный
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Например: «Молодой человек садится за стол, чтобы поесть»

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Левый верхний угол — изменить размер
pdfjs-editor-resizer-label-top-middle = Вверху посередине — изменить размер
pdfjs-editor-resizer-label-top-right = Верхний правый угол — изменить размер
pdfjs-editor-resizer-label-middle-right = В центре справа — изменить размер
pdfjs-editor-resizer-label-bottom-right = Нижний правый угол — изменить размер
pdfjs-editor-resizer-label-bottom-middle = Внизу посередине — изменить размер
pdfjs-editor-resizer-label-bottom-left = Нижний левый угол — изменить размер
pdfjs-editor-resizer-label-middle-left = В центре слева — изменить размер

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Цвет выделения
pdfjs-editor-colorpicker-button =
    .title = Изменить цвет
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Выбор цвета
pdfjs-editor-colorpicker-yellow =
    .title = Жёлтый
pdfjs-editor-colorpicker-green =
    .title = Зелёный
pdfjs-editor-colorpicker-blue =
    .title = Синий
pdfjs-editor-colorpicker-pink =
    .title = Розовый
pdfjs-editor-colorpicker-red =
    .title = Красный

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Показать все
pdfjs-editor-highlight-show-all-button =
    .title = Показать все
