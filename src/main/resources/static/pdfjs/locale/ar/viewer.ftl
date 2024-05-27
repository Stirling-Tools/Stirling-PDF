# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = الصفحة السابقة
pdfjs-previous-button-label = السابقة
pdfjs-next-button =
    .title = الصفحة التالية
pdfjs-next-button-label = التالية
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = صفحة
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = من { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } من { $pagesCount })
pdfjs-zoom-out-button =
    .title = بعّد
pdfjs-zoom-out-button-label = بعّد
pdfjs-zoom-in-button =
    .title = قرّب
pdfjs-zoom-in-button-label = قرّب
pdfjs-zoom-select =
    .title = التقريب
pdfjs-presentation-mode-button =
    .title = انتقل لوضع العرض التقديمي
pdfjs-presentation-mode-button-label = وضع العرض التقديمي
pdfjs-open-file-button =
    .title = افتح ملفًا
pdfjs-open-file-button-label = افتح
pdfjs-print-button =
    .title = اطبع
pdfjs-print-button-label = اطبع
pdfjs-save-button =
    .title = احفظ
pdfjs-save-button-label = احفظ
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = نزّل
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = نزّل
pdfjs-bookmark-button =
    .title = الصفحة الحالية (عرض URL من الصفحة الحالية)
pdfjs-bookmark-button-label = الصفحة الحالية

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = الأدوات
pdfjs-tools-button-label = الأدوات
pdfjs-first-page-button =
    .title = انتقل إلى الصفحة الأولى
pdfjs-first-page-button-label = انتقل إلى الصفحة الأولى
pdfjs-last-page-button =
    .title = انتقل إلى الصفحة الأخيرة
pdfjs-last-page-button-label = انتقل إلى الصفحة الأخيرة
pdfjs-page-rotate-cw-button =
    .title = أدر باتجاه عقارب الساعة
pdfjs-page-rotate-cw-button-label = أدر باتجاه عقارب الساعة
pdfjs-page-rotate-ccw-button =
    .title = أدر بعكس اتجاه عقارب الساعة
pdfjs-page-rotate-ccw-button-label = أدر بعكس اتجاه عقارب الساعة
pdfjs-cursor-text-select-tool-button =
    .title = فعّل أداة اختيار النص
pdfjs-cursor-text-select-tool-button-label = أداة اختيار النص
pdfjs-cursor-hand-tool-button =
    .title = فعّل أداة اليد
pdfjs-cursor-hand-tool-button-label = أداة اليد
pdfjs-scroll-page-button =
    .title = استخدم تمرير الصفحة
pdfjs-scroll-page-button-label = تمرير الصفحة
pdfjs-scroll-vertical-button =
    .title = استخدم التمرير الرأسي
pdfjs-scroll-vertical-button-label = التمرير الرأسي
pdfjs-scroll-horizontal-button =
    .title = استخدم التمرير الأفقي
pdfjs-scroll-horizontal-button-label = التمرير الأفقي
pdfjs-scroll-wrapped-button =
    .title = استخدم التمرير الملتف
pdfjs-scroll-wrapped-button-label = التمرير الملتف
pdfjs-spread-none-button =
    .title = لا تدمج هوامش الصفحات مع بعضها البعض
pdfjs-spread-none-button-label = بلا هوامش
pdfjs-spread-odd-button =
    .title = ادمج هوامش الصفحات الفردية
pdfjs-spread-odd-button-label = هوامش الصفحات الفردية
pdfjs-spread-even-button =
    .title = ادمج هوامش الصفحات الزوجية
pdfjs-spread-even-button-label = هوامش الصفحات الزوجية

## Document properties dialog

pdfjs-document-properties-button =
    .title = خصائص المستند…
pdfjs-document-properties-button-label = خصائص المستند…
pdfjs-document-properties-file-name = اسم الملف:
pdfjs-document-properties-file-size = حجم الملف:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } ك.بايت ({ $size_b } بايت)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } م.بايت ({ $size_b } بايت)
pdfjs-document-properties-title = العنوان:
pdfjs-document-properties-author = المؤلف:
pdfjs-document-properties-subject = الموضوع:
pdfjs-document-properties-keywords = الكلمات الأساسية:
pdfjs-document-properties-creation-date = تاريخ الإنشاء:
pdfjs-document-properties-modification-date = تاريخ التعديل:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }، { $time }
pdfjs-document-properties-creator = المنشئ:
pdfjs-document-properties-producer = منتج PDF:
pdfjs-document-properties-version = إصدارة PDF:
pdfjs-document-properties-page-count = عدد الصفحات:
pdfjs-document-properties-page-size = مقاس الورقة:
pdfjs-document-properties-page-size-unit-inches = بوصة
pdfjs-document-properties-page-size-unit-millimeters = ملم
pdfjs-document-properties-page-size-orientation-portrait = طوليّ
pdfjs-document-properties-page-size-orientation-landscape = عرضيّ
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = خطاب
pdfjs-document-properties-page-size-name-legal = قانونيّ

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = ‏{ $width } × ‏{ $height } ‏{ $unit } (‏{ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = ‏{ $width } × ‏{ $height } ‏{ $unit } (‏{ $name }، { $orientation })

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = العرض السريع عبر الوِب:
pdfjs-document-properties-linearized-yes = نعم
pdfjs-document-properties-linearized-no = لا
pdfjs-document-properties-close-button = أغلق

## Print

pdfjs-print-progress-message = يُحضّر المستند للطباعة…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }٪
pdfjs-print-progress-close-button = ألغِ
pdfjs-printing-not-supported = تحذير: لا يدعم هذا المتصفح الطباعة بشكل كامل.
pdfjs-printing-not-ready = تحذير: ملف PDF لم يُحمّل كاملًا للطباعة.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = بدّل ظهور الشريط الجانبي
pdfjs-toggle-sidebar-notification-button =
    .title = بدّل ظهور الشريط الجانبي (يحتوي المستند على مخطط أو مرفقات أو طبقات)
pdfjs-toggle-sidebar-button-label = بدّل ظهور الشريط الجانبي
pdfjs-document-outline-button =
    .title = اعرض فهرس المستند (نقر مزدوج لتمديد أو تقليص كل العناصر)
pdfjs-document-outline-button-label = مخطط المستند
pdfjs-attachments-button =
    .title = اعرض المرفقات
pdfjs-attachments-button-label = المُرفقات
pdfjs-layers-button =
    .title = اعرض الطبقات (انقر مرتين لتصفير كل الطبقات إلى الحالة المبدئية)
pdfjs-layers-button-label = ‏‏الطبقات
pdfjs-thumbs-button =
    .title = اعرض مُصغرات
pdfjs-thumbs-button-label = مُصغّرات
pdfjs-current-outline-item-button =
    .title = ابحث عن عنصر المخطّط التفصيلي الحالي
pdfjs-current-outline-item-button-label = عنصر المخطّط التفصيلي الحالي
pdfjs-findbar-button =
    .title = ابحث في المستند
pdfjs-findbar-button-label = ابحث
pdfjs-additional-layers = الطبقات الإضافية

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = صفحة { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = مصغّرة صفحة { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = ابحث
    .placeholder = ابحث في المستند…
pdfjs-find-previous-button =
    .title = ابحث عن التّواجد السّابق للعبارة
pdfjs-find-previous-button-label = السابق
pdfjs-find-next-button =
    .title = ابحث عن التّواجد التّالي للعبارة
pdfjs-find-next-button-label = التالي
pdfjs-find-highlight-checkbox = أبرِز الكل
pdfjs-find-match-case-checkbox-label = طابق حالة الأحرف
pdfjs-find-match-diacritics-checkbox-label = طابِق الحركات
pdfjs-find-entire-word-checkbox-label = كلمات كاملة
pdfjs-find-reached-top = تابعت من الأسفل بعدما وصلت إلى بداية المستند
pdfjs-find-reached-bottom = تابعت من الأعلى بعدما وصلت إلى نهاية المستند
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [zero] لا  مطابقة
        [one] { $current } من أصل { $total } مطابقة
        [two] { $current } من أصل { $total } مطابقة
        [few] { $current } من أصل { $total } مطابقة
        [many] { $current } من أصل { $total } مطابقة
       *[other] { $current } من أصل { $total } مطابقة
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [zero] { $limit } مطابقة
        [one] أكثر من { $limit } مطابقة
        [two] أكثر من { $limit } مطابقة
        [few] أكثر من { $limit } مطابقة
        [many] أكثر من { $limit } مطابقة
       *[other] أكثر من { $limit } مطابقات
    }
pdfjs-find-not-found = لا وجود للعبارة

## Predefined zoom values

pdfjs-page-scale-width = عرض الصفحة
pdfjs-page-scale-fit = ملائمة الصفحة
pdfjs-page-scale-auto = تقريب تلقائي
pdfjs-page-scale-actual = الحجم الفعلي
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }٪

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = صفحة { $page }

## Loading indicator messages

pdfjs-loading-error = حدث عطل أثناء تحميل ملف PDF.
pdfjs-invalid-file-error = ملف PDF تالف أو غير صحيح.
pdfjs-missing-file-error = ملف PDF غير موجود.
pdfjs-unexpected-response-error = استجابة خادوم غير متوقعة.
pdfjs-rendering-error = حدث خطأ أثناء عرض الصفحة.

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date }، { $time }
# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [تعليق { $type }]

## Password

pdfjs-password-label = أدخل لكلمة السر لفتح هذا الملف.
pdfjs-password-invalid = كلمة سر خطأ. من فضلك أعد المحاولة.
pdfjs-password-ok-button = حسنا
pdfjs-password-cancel-button = ألغِ
pdfjs-web-fonts-disabled = خطوط الوب مُعطّلة: تعذّر استخدام خطوط PDF المُضمّنة.

## Editing

pdfjs-editor-free-text-button =
    .title = نص
pdfjs-editor-free-text-button-label = نص
pdfjs-editor-ink-button =
    .title = ارسم
pdfjs-editor-ink-button-label = ارسم
pdfjs-editor-stamp-button =
    .title = أضِف أو حرّر الصور
pdfjs-editor-stamp-button-label = أضِف أو حرّر الصور
pdfjs-editor-highlight-button =
    .title = أبرِز
pdfjs-editor-highlight-button-label = أبرِز
pdfjs-highlight-floating-button =
    .title = أبرِز
pdfjs-highlight-floating-button1 =
    .title = أبرِز
    .aria-label = أبرِز
pdfjs-highlight-floating-button-label = أبرِز

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = أزِل الرسم
pdfjs-editor-remove-freetext-button =
    .title = أزِل النص
pdfjs-editor-remove-stamp-button =
    .title = أزِل الصورة
pdfjs-editor-remove-highlight-button =
    .title = أزِل الإبراز

##

# Editor Parameters
pdfjs-editor-free-text-color-input = اللون
pdfjs-editor-free-text-size-input = الحجم
pdfjs-editor-ink-color-input = اللون
pdfjs-editor-ink-thickness-input = السماكة
pdfjs-editor-ink-opacity-input = العتامة
pdfjs-editor-stamp-add-image-button =
    .title = أضِف صورة
pdfjs-editor-stamp-add-image-button-label = أضِف صورة
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = السماكة
pdfjs-editor-free-highlight-thickness-title =
    .title = غيّر السُمك عند إبراز عناصر أُخرى غير النص
pdfjs-free-text =
    .aria-label = محرِّر النص
pdfjs-free-text-default-content = ابدأ الكتابة…
pdfjs-ink =
    .aria-label = محرِّر الرسم
pdfjs-ink-canvas =
    .aria-label = صورة أنشأها المستخدم

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = نص بديل
pdfjs-editor-alt-text-edit-button-label = تحرير النص البديل
pdfjs-editor-alt-text-dialog-label = اختر خيار
pdfjs-editor-alt-text-dialog-description = يساعد النص البديل عندما لا يتمكن الأشخاص من رؤية الصورة أو عندما لا يتم تحميلها.
pdfjs-editor-alt-text-add-description-label = أضِف وصف
pdfjs-editor-alt-text-add-description-description = استهدف جملتين تصفان الموضوع أو الإعداد أو الإجراءات.
pdfjs-editor-alt-text-mark-decorative-label = علّمها على أنها زخرفية
pdfjs-editor-alt-text-mark-decorative-description = يُستخدم هذا في الصور المزخرفة، مثل الحدود أو العلامات المائية.
pdfjs-editor-alt-text-cancel-button = ألغِ
pdfjs-editor-alt-text-save-button = احفظ
pdfjs-editor-alt-text-decorative-tooltip = عُلّمت على أنها زخرفية
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = على سبيل المثال، "يجلس شاب على الطاولة لتناول وجبة"

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = الزاوية اليُسرى العُليا — غيّر الحجم
pdfjs-editor-resizer-label-top-middle = أعلى الوسط - غيّر الحجم
pdfjs-editor-resizer-label-top-right = الزاوية اليُمنى العُليا - غيّر الحجم
pdfjs-editor-resizer-label-middle-right = اليمين الأوسط - غيّر الحجم
pdfjs-editor-resizer-label-bottom-right = الزاوية اليُمنى السُفلى - غيّر الحجم
pdfjs-editor-resizer-label-bottom-middle = أسفل الوسط - غيّر الحجم
pdfjs-editor-resizer-label-bottom-left = الزاوية اليُسرى السُفلية - غيّر الحجم
pdfjs-editor-resizer-label-middle-left = مُنتصف اليسار - غيّر الحجم

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = أبرِز اللون
pdfjs-editor-colorpicker-button =
    .title = غيّر اللون
pdfjs-editor-colorpicker-dropdown =
    .aria-label = اختيارات الألوان
pdfjs-editor-colorpicker-yellow =
    .title = أصفر
pdfjs-editor-colorpicker-green =
    .title = أخضر
pdfjs-editor-colorpicker-blue =
    .title = أزرق
pdfjs-editor-colorpicker-pink =
    .title = وردي
pdfjs-editor-colorpicker-red =
    .title = أحمر

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = أظهِر الكل
pdfjs-editor-highlight-show-all-button =
    .title = أظهِر الكل
