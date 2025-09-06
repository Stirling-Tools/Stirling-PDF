# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Əvvəlki səhifə
pdfjs-previous-button-label = Əvvəlkini tap
pdfjs-next-button =
    .title = Növbəti səhifə
pdfjs-next-button-label = İrəli
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Səhifə
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = / { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } / { $pagesCount })
pdfjs-zoom-out-button =
    .title = Uzaqlaş
pdfjs-zoom-out-button-label = Uzaqlaş
pdfjs-zoom-in-button =
    .title = Yaxınlaş
pdfjs-zoom-in-button-label = Yaxınlaş
pdfjs-zoom-select =
    .title = Yaxınlaşdırma
pdfjs-presentation-mode-button =
    .title = Təqdimat Rejiminə Keç
pdfjs-presentation-mode-button-label = Təqdimat Rejimi
pdfjs-open-file-button =
    .title = Fayl Aç
pdfjs-open-file-button-label = Aç
pdfjs-print-button =
    .title = Yazdır
pdfjs-print-button-label = Yazdır

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Alətlər
pdfjs-tools-button-label = Alətlər
pdfjs-first-page-button =
    .title = İlk Səhifəyə get
pdfjs-first-page-button-label = İlk Səhifəyə get
pdfjs-last-page-button =
    .title = Son Səhifəyə get
pdfjs-last-page-button-label = Son Səhifəyə get
pdfjs-page-rotate-cw-button =
    .title = Saat İstiqamətində Fırlat
pdfjs-page-rotate-cw-button-label = Saat İstiqamətində Fırlat
pdfjs-page-rotate-ccw-button =
    .title = Saat İstiqamətinin Əksinə Fırlat
pdfjs-page-rotate-ccw-button-label = Saat İstiqamətinin Əksinə Fırlat
pdfjs-cursor-text-select-tool-button =
    .title = Yazı seçmə alətini aktivləşdir
pdfjs-cursor-text-select-tool-button-label = Yazı seçmə aləti
pdfjs-cursor-hand-tool-button =
    .title = Əl alətini aktivləşdir
pdfjs-cursor-hand-tool-button-label = Əl aləti
pdfjs-scroll-vertical-button =
    .title = Şaquli sürüşdürmə işlət
pdfjs-scroll-vertical-button-label = Şaquli sürüşdürmə
pdfjs-scroll-horizontal-button =
    .title = Üfüqi sürüşdürmə işlət
pdfjs-scroll-horizontal-button-label = Üfüqi sürüşdürmə
pdfjs-scroll-wrapped-button =
    .title = Bükülü sürüşdürmə işlət
pdfjs-scroll-wrapped-button-label = Bükülü sürüşdürmə
pdfjs-spread-none-button =
    .title = Yan-yana birləşdirilmiş səhifələri işlətmə
pdfjs-spread-none-button-label = Birləşdirmə
pdfjs-spread-odd-button =
    .title = Yan-yana birləşdirilmiş səhifələri tək nömrəli səhifələrdən başlat
pdfjs-spread-odd-button-label = Tək nömrəli
pdfjs-spread-even-button =
    .title = Yan-yana birləşdirilmiş səhifələri cüt nömrəli səhifələrdən başlat
pdfjs-spread-even-button-label = Cüt nömrəli

## Document properties dialog

pdfjs-document-properties-button =
    .title = Sənəd xüsusiyyətləri…
pdfjs-document-properties-button-label = Sənəd xüsusiyyətləri…
pdfjs-document-properties-file-name = Fayl adı:
pdfjs-document-properties-file-size = Fayl ölçüsü:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bayt)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bayt)
pdfjs-document-properties-title = Başlık:
pdfjs-document-properties-author = Müəllif:
pdfjs-document-properties-subject = Mövzu:
pdfjs-document-properties-keywords = Açar sözlər:
pdfjs-document-properties-creation-date = Yaradılış Tarixi :
pdfjs-document-properties-modification-date = Dəyişdirilmə Tarixi :
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Yaradan:
pdfjs-document-properties-producer = PDF yaradıcısı:
pdfjs-document-properties-version = PDF versiyası:
pdfjs-document-properties-page-count = Səhifə sayı:
pdfjs-document-properties-page-size = Səhifə Ölçüsü:
pdfjs-document-properties-page-size-unit-inches = inç
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = portret
pdfjs-document-properties-page-size-orientation-landscape = albom
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Məktub
pdfjs-document-properties-page-size-name-legal = Hüquqi

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
pdfjs-document-properties-linearized = Fast Web View:
pdfjs-document-properties-linearized-yes = Bəli
pdfjs-document-properties-linearized-no = Xeyr
pdfjs-document-properties-close-button = Qapat

## Print

pdfjs-print-progress-message = Sənəd çap üçün hazırlanır…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Ləğv et
pdfjs-printing-not-supported = Xəbərdarlıq: Çap bu səyyah tərəfindən tam olaraq dəstəklənmir.
pdfjs-printing-not-ready = Xəbərdarlıq: PDF çap üçün tam yüklənməyib.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Yan Paneli Aç/Bağla
pdfjs-toggle-sidebar-notification-button =
    .title = Yan paneli çevir (sənəddə icmal/bağlamalar/laylar mövcuddur)
pdfjs-toggle-sidebar-button-label = Yan Paneli Aç/Bağla
pdfjs-document-outline-button =
    .title = Sənədin eskizini göstər (bütün bəndləri açmaq/yığmaq üçün iki dəfə klikləyin)
pdfjs-document-outline-button-label = Sənəd strukturu
pdfjs-attachments-button =
    .title = Bağlamaları göstər
pdfjs-attachments-button-label = Bağlamalar
pdfjs-layers-button =
    .title = Layları göstər (bütün layları ilkin halına sıfırlamaq üçün iki dəfə klikləyin)
pdfjs-layers-button-label = Laylar
pdfjs-thumbs-button =
    .title = Kiçik şəkilləri göstər
pdfjs-thumbs-button-label = Kiçik şəkillər
pdfjs-findbar-button =
    .title = Sənəddə Tap
pdfjs-findbar-button-label = Tap
pdfjs-additional-layers = Əlavə laylar

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Səhifə{ $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page } səhifəsinin kiçik vəziyyəti

## Find panel button title and messages

pdfjs-find-input =
    .title = Tap
    .placeholder = Sənəddə tap…
pdfjs-find-previous-button =
    .title = Bir öncəki uyğun gələn sözü tapır
pdfjs-find-previous-button-label = Geri
pdfjs-find-next-button =
    .title = Bir sonrakı uyğun gələn sözü tapır
pdfjs-find-next-button-label = İrəli
pdfjs-find-highlight-checkbox = İşarələ
pdfjs-find-match-case-checkbox-label = Böyük/kiçik hərfə həssaslıq
pdfjs-find-entire-word-checkbox-label = Tam sözlər
pdfjs-find-reached-top = Sənədin yuxarısına çatdı, aşağıdan davam edir
pdfjs-find-reached-bottom = Sənədin sonuna çatdı, yuxarıdan davam edir
pdfjs-find-not-found = Uyğunlaşma tapılmadı

## Predefined zoom values

pdfjs-page-scale-width = Səhifə genişliyi
pdfjs-page-scale-fit = Səhifəni sığdır
pdfjs-page-scale-auto = Avtomatik yaxınlaşdır
pdfjs-page-scale-actual = Hazırkı Həcm
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = PDF yüklenərkən bir səhv yarandı.
pdfjs-invalid-file-error = Səhv və ya zədələnmiş olmuş PDF fayl.
pdfjs-missing-file-error = PDF fayl yoxdur.
pdfjs-unexpected-response-error = Gözlənilməz server cavabı.
pdfjs-rendering-error = Səhifə göstərilərkən səhv yarandı.

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
    .alt = [{ $type } Annotasiyası]

## Password

pdfjs-password-label = Bu PDF faylı açmaq üçün parolu daxil edin.
pdfjs-password-invalid = Parol səhvdir. Bir daha yoxlayın.
pdfjs-password-ok-button = Tamam
pdfjs-password-cancel-button = Ləğv et
pdfjs-web-fonts-disabled = Web Şriftlər söndürülüb: yerləşdirilmiş PDF şriftlərini istifadə etmək mümkün deyil.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

