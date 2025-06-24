# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = پچھلا صفحہ
pdfjs-previous-button-label = پچھلا
pdfjs-next-button =
    .title = اگلا صفحہ
pdfjs-next-button-label = آگے
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = صفحہ
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } کا
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } کا { $pagesCount })
pdfjs-zoom-out-button =
    .title = باہر زوم کریں
pdfjs-zoom-out-button-label = باہر زوم کریں
pdfjs-zoom-in-button =
    .title = اندر زوم کریں
pdfjs-zoom-in-button-label = اندر زوم کریں
pdfjs-zoom-select =
    .title = زوم
pdfjs-presentation-mode-button =
    .title = پیشکش موڈ میں چلے جائیں
pdfjs-presentation-mode-button-label = پیشکش موڈ
pdfjs-open-file-button =
    .title = مسل کھولیں
pdfjs-open-file-button-label = کھولیں
pdfjs-print-button =
    .title = چھاپیں
pdfjs-print-button-label = چھاپیں

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = آلات
pdfjs-tools-button-label = آلات
pdfjs-first-page-button =
    .title = پہلے صفحہ پر جائیں
pdfjs-first-page-button-label = پہلے صفحہ پر جائیں
pdfjs-last-page-button =
    .title = آخری صفحہ پر جائیں
pdfjs-last-page-button-label = آخری صفحہ پر جائیں
pdfjs-page-rotate-cw-button =
    .title = گھڑی وار گھمائیں
pdfjs-page-rotate-cw-button-label = گھڑی وار گھمائیں
pdfjs-page-rotate-ccw-button =
    .title = ضد گھڑی وار گھمائیں
pdfjs-page-rotate-ccw-button-label = ضد گھڑی وار گھمائیں
pdfjs-cursor-text-select-tool-button =
    .title = متن کے انتخاب کے ٹول کو فعال بناے
pdfjs-cursor-text-select-tool-button-label = متن کے انتخاب کا آلہ
pdfjs-cursor-hand-tool-button =
    .title = ہینڈ ٹول کو فعال بناییں
pdfjs-cursor-hand-tool-button-label = ہاتھ کا آلہ
pdfjs-scroll-vertical-button =
    .title = عمودی اسکرولنگ کا استعمال کریں
pdfjs-scroll-vertical-button-label = عمودی اسکرولنگ
pdfjs-scroll-horizontal-button =
    .title = افقی سکرولنگ کا استعمال کریں
pdfjs-scroll-horizontal-button-label = افقی سکرولنگ
pdfjs-spread-none-button =
    .title = صفحہ پھیلانے میں شامل نہ ہوں
pdfjs-spread-none-button-label = کوئی پھیلاؤ نہیں
pdfjs-spread-odd-button-label = تاک پھیلاؤ
pdfjs-spread-even-button-label = جفت پھیلاؤ

## Document properties dialog

pdfjs-document-properties-button =
    .title = دستاویز خواص…
pdfjs-document-properties-button-label = دستاویز خواص…
pdfjs-document-properties-file-name = نام مسل:
pdfjs-document-properties-file-size = مسل سائز:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = عنوان:
pdfjs-document-properties-author = تخلیق کار:
pdfjs-document-properties-subject = موضوع:
pdfjs-document-properties-keywords = کلیدی الفاظ:
pdfjs-document-properties-creation-date = تخلیق کی تاریخ:
pdfjs-document-properties-modification-date = ترمیم کی تاریخ:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }، { $time }
pdfjs-document-properties-creator = تخلیق کار:
pdfjs-document-properties-producer = PDF پیدا کار:
pdfjs-document-properties-version = PDF ورژن:
pdfjs-document-properties-page-count = صفحہ شمار:
pdfjs-document-properties-page-size = صفہ کی لمبائ:
pdfjs-document-properties-page-size-unit-inches = میں
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = عمودی انداز
pdfjs-document-properties-page-size-orientation-landscape = افقى انداز
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = خط
pdfjs-document-properties-page-size-name-legal = قانونی

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } { $name } { $orientation }

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = تیز ویب دیکھیں:
pdfjs-document-properties-linearized-yes = ہاں
pdfjs-document-properties-linearized-no = نہیں
pdfjs-document-properties-close-button = بند کریں

## Print

pdfjs-print-progress-message = چھاپنے کرنے کے لیے دستاویز تیار کیے جا رھے ھیں
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = *{ $progress }%*
pdfjs-print-progress-close-button = منسوخ کریں
pdfjs-printing-not-supported = تنبیہ:چھاپنا اس براؤزر پر پوری طرح معاونت شدہ نہیں ہے۔
pdfjs-printing-not-ready = تنبیہ: PDF چھپائی کے لیے پوری طرح لوڈ نہیں ہوئی۔

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = سلائیڈ ٹوگل کریں
pdfjs-toggle-sidebar-button-label = سلائیڈ ٹوگل کریں
pdfjs-document-outline-button =
    .title = دستاویز کی سرخیاں دکھایں (تمام اشیاء وسیع / غائب کرنے کے لیے ڈبل کلک کریں)
pdfjs-document-outline-button-label = دستاویز آؤٹ لائن
pdfjs-attachments-button =
    .title = منسلکات دکھائیں
pdfjs-attachments-button-label = منسلکات
pdfjs-thumbs-button =
    .title = تھمبنیل دکھائیں
pdfjs-thumbs-button-label = مجمل
pdfjs-findbar-button =
    .title = دستاویز میں ڈھونڈیں
pdfjs-findbar-button-label = ڈھونڈیں

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = صفحہ { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = صفحے کا مجمل { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = ڈھونڈیں
    .placeholder = دستاویز… میں ڈھونڈیں
pdfjs-find-previous-button =
    .title = فقرے کا پچھلا وقوع ڈھونڈیں
pdfjs-find-previous-button-label = پچھلا
pdfjs-find-next-button =
    .title = فقرے کا اگلہ وقوع ڈھونڈیں
pdfjs-find-next-button-label = آگے
pdfjs-find-highlight-checkbox = تمام نمایاں کریں
pdfjs-find-match-case-checkbox-label = حروف مشابہ کریں
pdfjs-find-entire-word-checkbox-label = تمام الفاظ
pdfjs-find-reached-top = صفحہ کے شروع پر پہنچ گیا، نیچے سے جاری کیا
pdfjs-find-reached-bottom = صفحہ کے اختتام پر پہنچ گیا، اوپر سے جاری کیا
pdfjs-find-not-found = فقرا نہیں ملا

## Predefined zoom values

pdfjs-page-scale-width = صفحہ چوڑائی
pdfjs-page-scale-fit = صفحہ فٹنگ
pdfjs-page-scale-auto = خودکار زوم
pdfjs-page-scale-actual = اصل سائز
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = صفحہ { $page }

## Loading indicator messages

pdfjs-loading-error = PDF لوڈ کرتے وقت نقص آ گیا۔
pdfjs-invalid-file-error = ناجائز یا خراب PDF مسل
pdfjs-missing-file-error = PDF مسل غائب ہے۔
pdfjs-unexpected-response-error = غیرمتوقع پیش کار جواب
pdfjs-rendering-error = صفحہ بناتے ہوئے نقص آ گیا۔

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date }.{ $time }
# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } نوٹ]

## Password

pdfjs-password-label = PDF مسل کھولنے کے لیے پاس ورڈ داخل کریں.
pdfjs-password-invalid = ناجائز پاس ورڈ. براےؑ کرم دوبارہ کوشش کریں.
pdfjs-password-ok-button = ٹھیک ہے
pdfjs-password-cancel-button = منسوخ کریں
pdfjs-web-fonts-disabled = ویب فانٹ نا اہل ہیں: شامل PDF فانٹ استعمال کرنے میں ناکام۔

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

