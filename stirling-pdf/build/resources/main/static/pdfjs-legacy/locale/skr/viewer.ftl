# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = پچھلا ورقہ
pdfjs-previous-button-label = پچھلا
pdfjs-next-button =
    .title = اڳلا ورقہ
pdfjs-next-button-label = اڳلا
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = ورقہ
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } دا
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } دا { $pagesCount })
pdfjs-zoom-out-button =
    .title = زوم آؤٹ
pdfjs-zoom-out-button-label = زوم آؤٹ
pdfjs-zoom-in-button =
    .title = زوم اِن
pdfjs-zoom-in-button-label = زوم اِن
pdfjs-zoom-select =
    .title = زوم
pdfjs-presentation-mode-button =
    .title = پریزنٹیشن موڈ تے سوئچ کرو
pdfjs-presentation-mode-button-label = پریزنٹیشن موڈ
pdfjs-open-file-button =
    .title = فائل کھولو
pdfjs-open-file-button-label = کھولو
pdfjs-print-button =
    .title = چھاپو
pdfjs-print-button-label = چھاپو
pdfjs-save-button =
    .title = ہتھیکڑا کرو
pdfjs-save-button-label = ہتھیکڑا کرو
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = ڈاؤن لوڈ
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = ڈاؤن لوڈ
pdfjs-bookmark-button =
    .title = موجودہ ورقہ (موجودہ ورقے کنوں یوآرایل ݙیکھو)
pdfjs-bookmark-button-label = موجودہ ورقہ

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = اوزار
pdfjs-tools-button-label = اوزار
pdfjs-first-page-button =
    .title = پہلے ورقے تے ونڄو
pdfjs-first-page-button-label = پہلے ورقے تے ونڄو
pdfjs-last-page-button =
    .title = چھیکڑی ورقے تے ونڄو
pdfjs-last-page-button-label = چھیکڑی ورقے تے ونڄو
pdfjs-page-rotate-cw-button =
    .title = گھڑی وانگوں گھماؤ
pdfjs-page-rotate-cw-button-label = گھڑی وانگوں گھماؤ
pdfjs-page-rotate-ccw-button =
    .title = گھڑی تے اُپٹھ گھماؤ
pdfjs-page-rotate-ccw-button-label = گھڑی تے اُپٹھ گھماؤ
pdfjs-cursor-text-select-tool-button =
    .title = متن منتخب کݨ والا آلہ فعال بݨاؤ
pdfjs-cursor-text-select-tool-button-label = متن منتخب کرݨ والا آلہ
pdfjs-cursor-hand-tool-button =
    .title = ہینڈ ٹول فعال بݨاؤ
pdfjs-cursor-hand-tool-button-label = ہینڈ ٹول
pdfjs-scroll-page-button =
    .title = پیج سکرولنگ استعمال کرو
pdfjs-scroll-page-button-label = پیج سکرولنگ
pdfjs-scroll-vertical-button =
    .title = عمودی سکرولنگ استعمال کرو
pdfjs-scroll-vertical-button-label = عمودی سکرولنگ
pdfjs-scroll-horizontal-button =
    .title = افقی سکرولنگ استعمال کرو
pdfjs-scroll-horizontal-button-label = افقی سکرولنگ
pdfjs-scroll-wrapped-button =
    .title = ویڑھی ہوئی سکرولنگ استعمال کرو
pdfjs-scroll-wrapped-button-label = وہڑھی ہوئی سکرولنگ
pdfjs-spread-none-button =
    .title = پیج سپریڈز وِچ شامل نہ تھیوو۔
pdfjs-spread-none-button-label = کوئی پولھ کائنی
pdfjs-spread-odd-button =
    .title = طاق نمبر والے ورقیاں دے نال شروع تھیوݨ والے پیج سپریڈز وِچ شامل تھیوو۔
pdfjs-spread-odd-button-label = تاک پھیلاؤ
pdfjs-spread-even-button =
    .title = جفت نمر والے ورقیاں نال شروع تھیوݨ والے پیج سپریڈز وِ شامل تھیوو۔
pdfjs-spread-even-button-label = جفت پھیلاؤ

## Document properties dialog

pdfjs-document-properties-button =
    .title = دستاویز خواص…
pdfjs-document-properties-button-label = دستاویز خواص …
pdfjs-document-properties-file-name = فائل دا ناں:
pdfjs-document-properties-file-size = فائل دا سائز:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } کے بی ({ $size_b } بائٹس)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } ایم بی ({ $size_b } بائٹس)
pdfjs-document-properties-title = عنوان:
pdfjs-document-properties-author = تخلیق کار:
pdfjs-document-properties-subject = موضوع:
pdfjs-document-properties-keywords = کلیدی الفاظ:
pdfjs-document-properties-creation-date = تخلیق دی تاریخ:
pdfjs-document-properties-modification-date = ترمیم دی تاریخ:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = تخلیق کار:
pdfjs-document-properties-producer = PDF پیدا کار:
pdfjs-document-properties-version = PDF ورژن:
pdfjs-document-properties-page-count = ورقہ شماری:
pdfjs-document-properties-page-size = ورقہ دی سائز:
pdfjs-document-properties-page-size-unit-inches = وِچ
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = عمودی انداز
pdfjs-document-properties-page-size-orientation-landscape = افقى انداز
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = لیٹر
pdfjs-document-properties-page-size-name-legal = قنونی

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
pdfjs-document-properties-linearized = تکھا ویب نظارہ:
pdfjs-document-properties-linearized-yes = جیا
pdfjs-document-properties-linearized-no = کو
pdfjs-document-properties-close-button = بند کرو

## Print

pdfjs-print-progress-message = چھاپݨ کیتے دستاویز تیار تھیندے پئے ہن …
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = منسوخ کرو
pdfjs-printing-not-supported = چتاوݨی: چھپائی ایں براؤزر تے پوری طراں معاونت شدہ کائنی۔
pdfjs-printing-not-ready = چتاوݨی: PDF چھپائی کیتے پوری طراں لوڈ نئیں تھئی۔

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = سائیڈ بار ٹوگل کرو
pdfjs-toggle-sidebar-notification-button =
    .title = سائیڈ بار ٹوگل کرو (دستاویز وِچ آؤٹ لائن/ منسلکات/ پرتاں شامل ہن)
pdfjs-toggle-sidebar-button-label = سائیڈ بار ٹوگل کرو
pdfjs-document-outline-button =
    .title = دستاویز دا خاکہ ݙکھاؤ (تمام آئٹمز کوں پھیلاوݨ/سنگوڑݨ کیتے ڈبل کلک کرو)
pdfjs-document-outline-button-label = دستاویز آؤٹ لائن
pdfjs-attachments-button =
    .title = نتھیاں ݙکھاؤ
pdfjs-attachments-button-label = منسلکات
pdfjs-layers-button =
    .title = پرتاں ݙکھاؤ (تمام پرتاں کوں ڈیفالٹ حالت وِچ دوبارہ ترتیب ݙیوݨ کیتے ڈبل کلک کرو)
pdfjs-layers-button-label = پرتاں
pdfjs-thumbs-button =
    .title = تھمبنیل ݙکھاؤ
pdfjs-thumbs-button-label = تھمبنیلز
pdfjs-current-outline-item-button =
    .title = موجودہ آؤٹ لائن آئٹم لبھو
pdfjs-current-outline-item-button-label = موجودہ آؤٹ لائن آئٹم
pdfjs-findbar-button =
    .title = دستاویز وِچ لبھو
pdfjs-findbar-button-label = لبھو
pdfjs-additional-layers = اضافی پرتاں

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = ورقہ { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = ورقے دا تھمبنیل { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = لبھو
    .placeholder = دستاویز وِچ لبھو …
pdfjs-find-previous-button =
    .title = فقرے دا پچھلا واقعہ لبھو
pdfjs-find-previous-button-label = پچھلا
pdfjs-find-next-button =
    .title = فقرے دا اڳلا واقعہ لبھو
pdfjs-find-next-button-label = اڳلا
pdfjs-find-highlight-checkbox = تمام نشابر کرو
pdfjs-find-match-case-checkbox-label = حروف مشابہ کرو
pdfjs-find-match-diacritics-checkbox-label = ڈائیکرٹکس مشابہ کرو
pdfjs-find-entire-word-checkbox-label = تمام الفاظ
pdfjs-find-reached-top = ورقے دے شروع تے پُج ڳیا، تلوں جاری کیتا ڳیا
pdfjs-find-reached-bottom = ورقے دے پاند تے پُڄ ڳیا، اُتوں شروع کیتا ڳیا
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $total } وِچوں { $current } مشابہ
       *[other] { $total } وِچوں { $current } مشابے
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] { $limit } توں ودھ مماثلت۔
       *[other] { $limit } توں ودھ مماثلتاں۔
    }
pdfjs-find-not-found = فقرہ نئیں ملیا

## Predefined zoom values

pdfjs-page-scale-width = ورقے دی چوڑائی
pdfjs-page-scale-fit = ورقہ فٹنگ
pdfjs-page-scale-auto = آپوں آپ زوم
pdfjs-page-scale-actual = اصل میچا
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = ورقہ { $page }

## Loading indicator messages

pdfjs-loading-error = PDF لوڈ کریندے ویلھے نقص آ ڳیا۔
pdfjs-invalid-file-error = غلط یا خراب شدہ PDF فائل۔
pdfjs-missing-file-error = PDF فائل غائب ہے۔
pdfjs-unexpected-response-error = سرور دا غیر متوقع جواب۔
pdfjs-rendering-error = ورقہ رینڈر کریندے ویلھے ہک خرابی پیش آڳئی۔

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
    .alt = [{ $type } تشریح]

## Password

pdfjs-password-label = ایہ PDF فائل کھولݨ کیتے پاس ورڈ درج کرو۔
pdfjs-password-invalid = غلط پاس ورڈ: براہ مہربانی ولدا کوشش کرو۔
pdfjs-password-ok-button = ٹھیک ہے
pdfjs-password-cancel-button = منسوخ کرو
pdfjs-web-fonts-disabled = ویب فونٹس غیر فعال ہن: ایمبیڈڈ PDF  فونٹس استعمال کرݨ کنوں قاصر ہن

## Editing

pdfjs-editor-free-text-button =
    .title = متن
pdfjs-editor-free-text-button-label = متن
pdfjs-editor-ink-button =
    .title = چھکو
pdfjs-editor-ink-button-label = چھکو
pdfjs-editor-stamp-button =
    .title = تصویراں کوں شامل کرو یا ترمیم کرو
pdfjs-editor-stamp-button-label = تصویراں کوں شامل کرو یا ترمیم کرو
pdfjs-editor-highlight-button =
    .title = نمایاں کرو
pdfjs-editor-highlight-button-label = نمایاں کرو
pdfjs-highlight-floating-button =
    .title = نمایاں کرو
pdfjs-highlight-floating-button1 =
    .title = نمایاں کرو
    .aria-label = نمایاں کرو
pdfjs-highlight-floating-button-label = نمایاں کرو

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = ڈرائینگ ہٹاؤ
pdfjs-editor-remove-freetext-button =
    .title = متن ہٹاؤ
pdfjs-editor-remove-stamp-button =
    .title = تصویر ہٹاؤ
pdfjs-editor-remove-highlight-button =
    .title = نمایاں ہٹاؤ

##

# Editor Parameters
pdfjs-editor-free-text-color-input = رنگ
pdfjs-editor-free-text-size-input = سائز
pdfjs-editor-ink-color-input = رنگ
pdfjs-editor-ink-thickness-input = ٹھولھ
pdfjs-editor-ink-opacity-input = دھندلاپن
pdfjs-editor-stamp-add-image-button =
    .title = تصویر شامل کرو
pdfjs-editor-stamp-add-image-button-label = تصویر شامل کرو
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = مُٹاݨ
pdfjs-editor-free-highlight-thickness-title =
    .title = متن توں ان٘ج ٻئے شئیں کوں نمایاں کرݨ ویلے مُٹاݨ کوں بدلو
pdfjs-free-text =
    .aria-label = ٹیکسٹ ایڈیٹر
pdfjs-free-text-default-content = ٹائپنگ شروع کرو …
pdfjs-ink =
    .aria-label = ڈرا ایڈیٹر
pdfjs-ink-canvas =
    .aria-label = صارف دی بݨائی ہوئی تصویر

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alt متن
pdfjs-editor-alt-text-edit-button-label = alt متن وِچ ترمیم کرو
pdfjs-editor-alt-text-dialog-label = ہِک اختیار چُݨو
pdfjs-editor-alt-text-dialog-description = Alt متن (متبادل متن) اِیں ویلے مَدَت کرین٘دا ہِے جہڑیلے لوک تصویر کوں نِھیں ݙیکھ سڳدے یا جہڑیلے اِیہ لوڈ کائنی تِھین٘دا۔
pdfjs-editor-alt-text-add-description-label = تفصیل شامل کرو
pdfjs-editor-alt-text-add-description-description = 1-2 جملیاں دا مقصد جہڑے موضوع، ترتیب، یا اعمال کوں بیان کرین٘دے ہِن۔
pdfjs-editor-alt-text-mark-decorative-label = آرائشی طور تے نشان زد کرو
pdfjs-editor-alt-text-mark-decorative-description = اِیہ آرائشی تصویراں کِیتے استعمال تِھین٘دا ہِے، جیویں بارڈر یا واٹر مارکس۔
pdfjs-editor-alt-text-cancel-button = منسوخ
pdfjs-editor-alt-text-save-button = محفوظ
pdfjs-editor-alt-text-decorative-tooltip = آرائشی دے طور تے نشان زد تِھی ڳِیا
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = مثال دے طور تے، "ہِک جؤان کھاݨاں کھاوݨ کِیتے میز اُتّے ٻیٹھا ہِے"

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = اُتلی کَھٻّی نُکّڑ — سائز بدلو
pdfjs-editor-resizer-label-top-middle = اُتلا وِچلا — سائز بدلو
pdfjs-editor-resizer-label-top-right = اُتلی سَڄّی نُکَّڑ — سائز بدلو
pdfjs-editor-resizer-label-middle-right = وِچلا سڄّا — سائز بدلو
pdfjs-editor-resizer-label-bottom-right = تلوِیں سَڄّی نُکَّڑ — سائز بدلو
pdfjs-editor-resizer-label-bottom-middle = تلواں وِچلا — سائز بدلو
pdfjs-editor-resizer-label-bottom-left = تلوِیں کَھٻّی نُکّڑ — سائز بدلو
pdfjs-editor-resizer-label-middle-left = وِچلا کَھٻّا — سائز بدلو

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = نشابر رنگ
pdfjs-editor-colorpicker-button =
    .title = رنگ بدلو
pdfjs-editor-colorpicker-dropdown =
    .aria-label = رنگ اختیارات
pdfjs-editor-colorpicker-yellow =
    .title = پیلا
pdfjs-editor-colorpicker-green =
    .title = ساوا
pdfjs-editor-colorpicker-blue =
    .title = نیلا
pdfjs-editor-colorpicker-pink =
    .title = گلابی
pdfjs-editor-colorpicker-red =
    .title = لال

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = سارے ݙکھاؤ
pdfjs-editor-highlight-show-all-button =
    .title = سارے ݙکھاؤ
