# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = پەڕەی پێشوو
pdfjs-previous-button-label = پێشوو
pdfjs-next-button =
    .title = پەڕەی دوواتر
pdfjs-next-button-label = دوواتر
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = پەرە
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = لە { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } لە { $pagesCount })
pdfjs-zoom-out-button =
    .title = ڕۆچوونی
pdfjs-zoom-out-button-label = ڕۆچوونی
pdfjs-zoom-in-button =
    .title = هێنانەپێش
pdfjs-zoom-in-button-label = هێنانەپێش
pdfjs-zoom-select =
    .title = زووم
pdfjs-presentation-mode-button =
    .title = گۆڕین بۆ دۆخی پێشکەشکردن
pdfjs-presentation-mode-button-label = دۆخی پێشکەشکردن
pdfjs-open-file-button =
    .title = پەڕگە بکەرەوە
pdfjs-open-file-button-label = کردنەوە
pdfjs-print-button =
    .title = چاپکردن
pdfjs-print-button-label = چاپکردن

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = ئامرازەکان
pdfjs-tools-button-label = ئامرازەکان
pdfjs-first-page-button =
    .title = برۆ بۆ یەکەم پەڕە
pdfjs-first-page-button-label = بڕۆ بۆ یەکەم پەڕە
pdfjs-last-page-button =
    .title = بڕۆ بۆ کۆتا پەڕە
pdfjs-last-page-button-label = بڕۆ بۆ کۆتا پەڕە
pdfjs-page-rotate-cw-button =
    .title = ئاڕاستەی میلی کاتژمێر
pdfjs-page-rotate-cw-button-label = ئاڕاستەی میلی کاتژمێر
pdfjs-page-rotate-ccw-button =
    .title = پێچەوانەی میلی کاتژمێر
pdfjs-page-rotate-ccw-button-label = پێچەوانەی میلی کاتژمێر
pdfjs-cursor-text-select-tool-button =
    .title = توڵامرازی نیشانکەری دەق چالاک بکە
pdfjs-cursor-text-select-tool-button-label = توڵامرازی نیشانکەری دەق
pdfjs-cursor-hand-tool-button =
    .title = توڵامرازی دەستی چالاک بکە
pdfjs-cursor-hand-tool-button-label = توڵامرازی دەستی
pdfjs-scroll-vertical-button =
    .title = ناردنی ئەستوونی بەکاربێنە
pdfjs-scroll-vertical-button-label = ناردنی ئەستوونی
pdfjs-scroll-horizontal-button =
    .title = ناردنی ئاسۆیی بەکاربێنە
pdfjs-scroll-horizontal-button-label = ناردنی ئاسۆیی
pdfjs-scroll-wrapped-button =
    .title = ناردنی لوولکراو بەکاربێنە
pdfjs-scroll-wrapped-button-label = ناردنی لوولکراو

## Document properties dialog

pdfjs-document-properties-button =
    .title = تایبەتمەندییەکانی بەڵگەنامە...
pdfjs-document-properties-button-label = تایبەتمەندییەکانی بەڵگەنامە...
pdfjs-document-properties-file-name = ناوی پەڕگە:
pdfjs-document-properties-file-size = قەبارەی پەڕگە:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } کب ({ $size_b } بایت)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } مب ({ $size_b } بایت)
pdfjs-document-properties-title = سەردێڕ:
pdfjs-document-properties-author = نووسەر
pdfjs-document-properties-subject = بابەت:
pdfjs-document-properties-keywords = کلیلەوشە:
pdfjs-document-properties-creation-date = بەرواری درووستکردن:
pdfjs-document-properties-modification-date = بەرواری دەستکاریکردن:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = درووستکەر:
pdfjs-document-properties-producer = بەرهەمهێنەری PDF:
pdfjs-document-properties-version = وەشانی PDF:
pdfjs-document-properties-page-count = ژمارەی پەرەکان:
pdfjs-document-properties-page-size = قەبارەی پەڕە:
pdfjs-document-properties-page-size-unit-inches = ئینچ
pdfjs-document-properties-page-size-unit-millimeters = ملم
pdfjs-document-properties-page-size-orientation-portrait = پۆرترەیت(درێژ)
pdfjs-document-properties-page-size-orientation-landscape = پانیی
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = نامە
pdfjs-document-properties-page-size-name-legal = یاسایی

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
pdfjs-document-properties-linearized = پیشاندانی وێبی خێرا:
pdfjs-document-properties-linearized-yes = بەڵێ
pdfjs-document-properties-linearized-no = نەخێر
pdfjs-document-properties-close-button = داخستن

## Print

pdfjs-print-progress-message = بەڵگەنامە ئامادەدەکرێت بۆ چاپکردن...
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = پاشگەزبوونەوە
pdfjs-printing-not-supported = ئاگاداربە: چاپکردن بە تەواوی پشتگیر ناکرێت لەم وێبگەڕە.
pdfjs-printing-not-ready = ئاگاداربە: PDF بە تەواوی بارنەبووە بۆ چاپکردن.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = لاتەنیشت پیشاندان/شاردنەوە
pdfjs-toggle-sidebar-button-label = لاتەنیشت پیشاندان/شاردنەوە
pdfjs-document-outline-button-label = سنووری چوارچێوە
pdfjs-attachments-button =
    .title = پاشکۆکان پیشان بدە
pdfjs-attachments-button-label = پاشکۆکان
pdfjs-layers-button-label = چینەکان
pdfjs-thumbs-button =
    .title = وێنۆچکە پیشان بدە
pdfjs-thumbs-button-label = وێنۆچکە
pdfjs-findbar-button =
    .title = لە بەڵگەنامە بگەرێ
pdfjs-findbar-button-label = دۆزینەوە
pdfjs-additional-layers = چینی زیاتر

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = پەڕەی { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = وێنۆچکەی پەڕەی { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = دۆزینەوە
    .placeholder = لە بەڵگەنامە بگەرێ...
pdfjs-find-previous-button =
    .title = هەبوونی پێشوو بدۆزرەوە لە ڕستەکەدا
pdfjs-find-previous-button-label = پێشوو
pdfjs-find-next-button =
    .title = هەبوونی داهاتوو بدۆزەرەوە لە ڕستەکەدا
pdfjs-find-next-button-label = دوواتر
pdfjs-find-highlight-checkbox = هەمووی نیشانە بکە
pdfjs-find-match-case-checkbox-label = دۆخی لەیەکچوون
pdfjs-find-entire-word-checkbox-label = هەموو وشەکان
pdfjs-find-reached-top = گەشتیتە سەرەوەی بەڵگەنامە، لە خوارەوە دەستت پێکرد
pdfjs-find-reached-bottom = گەشتیتە کۆتایی بەڵگەنامە. لەسەرەوە دەستت پێکرد
pdfjs-find-not-found = نووسین نەدۆزرایەوە

## Predefined zoom values

pdfjs-page-scale-width = پانی پەڕە
pdfjs-page-scale-fit = پڕبوونی پەڕە
pdfjs-page-scale-auto = زوومی خۆکار
pdfjs-page-scale-actual = قەبارەی ڕاستی
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = هەڵەیەک ڕوویدا لە کاتی بارکردنی  PDF.
pdfjs-invalid-file-error = پەڕگەی pdf تێکچووە یان نەگونجاوە.
pdfjs-missing-file-error = پەڕگەی pdf بوونی نیە.
pdfjs-unexpected-response-error = وەڵامی ڕاژەخوازی نەخوازراو.
pdfjs-rendering-error = هەڵەیەک ڕوویدا لە کاتی پوختەکردنی (ڕێندەر) پەڕە.

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
    .alt = [{ $type } سەرنج]

## Password

pdfjs-password-label = وشەی تێپەڕ بنووسە بۆ کردنەوەی پەڕگەی pdf.
pdfjs-password-invalid = وشەی تێپەڕ هەڵەیە. تکایە دووبارە هەوڵ بدەرەوە.
pdfjs-password-ok-button = باشە
pdfjs-password-cancel-button = پاشگەزبوونەوە
pdfjs-web-fonts-disabled = جۆرەپیتی وێب ناچالاکە: نەتوانی جۆرەپیتی تێخراوی ناو pdfـەکە بەکاربێت.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

