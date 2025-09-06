# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = කලින් පිටුව
pdfjs-previous-button-label = කලින්
pdfjs-next-button =
    .title = ඊළඟ පිටුව
pdfjs-next-button-label = ඊළඟ
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = පිටුව
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } / { $pagesCount })
pdfjs-zoom-out-button =
    .title = කුඩාලනය
pdfjs-zoom-out-button-label = කුඩාලනය
pdfjs-zoom-in-button =
    .title = විශාලනය
pdfjs-zoom-in-button-label = විශාලනය
pdfjs-zoom-select =
    .title = විශාල කරන්න
pdfjs-presentation-mode-button =
    .title = සමර්පණ ප්‍රකාරය වෙත මාරුවන්න
pdfjs-presentation-mode-button-label = සමර්පණ ප්‍රකාරය
pdfjs-open-file-button =
    .title = ගොනුව අරින්න
pdfjs-open-file-button-label = අරින්න
pdfjs-print-button =
    .title = මුද්‍රණය
pdfjs-print-button-label = මුද්‍රණය
pdfjs-save-button =
    .title = සුරකින්න
pdfjs-save-button-label = සුරකින්න
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = බාගන්න
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = බාගන්න
pdfjs-bookmark-button-label = පවතින පිටුව
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = යෙදුමෙහි අරින්න
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = යෙදුමෙහි අරින්න

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = මෙවලම්
pdfjs-tools-button-label = මෙවලම්
pdfjs-first-page-button =
    .title = මුල් පිටුවට යන්න
pdfjs-first-page-button-label = මුල් පිටුවට යන්න
pdfjs-last-page-button =
    .title = අවසන් පිටුවට යන්න
pdfjs-last-page-button-label = අවසන් පිටුවට යන්න
pdfjs-cursor-text-select-tool-button =
    .title = පෙළ තේරීමේ මෙවලම සබල කරන්න
pdfjs-cursor-text-select-tool-button-label = පෙළ තේරීමේ මෙවලම
pdfjs-cursor-hand-tool-button =
    .title = අත් මෙවලම සබල කරන්න
pdfjs-cursor-hand-tool-button-label = අත් මෙවලම
pdfjs-scroll-page-button =
    .title = පිටුව අනුචලනය භාවිතය
pdfjs-scroll-page-button-label = පිටුව අනුචලනය
pdfjs-scroll-vertical-button =
    .title = සිරස් අනුචලනය භාවිතය
pdfjs-scroll-vertical-button-label = සිරස් අනුචලනය
pdfjs-scroll-horizontal-button =
    .title = තිරස් අනුචලනය භාවිතය
pdfjs-scroll-horizontal-button-label = තිරස් අනුචලනය

## Document properties dialog

pdfjs-document-properties-button =
    .title = ලේඛනයේ ගුණාංග…
pdfjs-document-properties-button-label = ලේඛනයේ ගුණාංග…
pdfjs-document-properties-file-name = ගොනුවේ නම:
pdfjs-document-properties-file-size = ගොනුවේ ප්‍රමාණය:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = කි.බ. { $size_kb } (බයිට { $size_b })
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = මෙ.බ. { $size_mb } (බයිට { $size_b })
pdfjs-document-properties-title = සිරැසිය:
pdfjs-document-properties-author = කතෘ:
pdfjs-document-properties-subject = මාතෘකාව:
pdfjs-document-properties-keywords = මූල පද:
pdfjs-document-properties-creation-date = සෑදූ දිනය:
pdfjs-document-properties-modification-date = සංශෝධිත දිනය:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = නිර්මාතෘ:
pdfjs-document-properties-producer = පීඩීඑෆ් සම්පාදක:
pdfjs-document-properties-version = පීඩීඑෆ් අනුවාදය:
pdfjs-document-properties-page-count = පිටු ගණන:
pdfjs-document-properties-page-size = පිටුවේ තරම:
pdfjs-document-properties-page-size-unit-inches = අඟල්
pdfjs-document-properties-page-size-unit-millimeters = මි.මී.
pdfjs-document-properties-page-size-orientation-portrait = සිරස්
pdfjs-document-properties-page-size-orientation-landscape = තිරස්
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width }×{ $height }{ $unit }{ $name }{ $orientation }

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = වේගවත් වියමන දැක්ම:
pdfjs-document-properties-linearized-yes = ඔව්
pdfjs-document-properties-linearized-no = නැහැ
pdfjs-document-properties-close-button = වසන්න

## Print

pdfjs-print-progress-message = මුද්‍රණය සඳහා ලේඛනය සූදානම් වෙමින්…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = අවලංගු කරන්න
pdfjs-printing-not-supported = අවවාදයයි: මෙම අතිරික්සුව මුද්‍රණය සඳහා හොඳින් සහාය නොදක්වයි.
pdfjs-printing-not-ready = අවවාදයයි: මුද්‍රණයට පීඩීඑෆ් ගොනුව සම්පූර්ණයෙන් පූරණය වී නැත.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-document-outline-button-label = ලේඛනයේ වටසන
pdfjs-attachments-button =
    .title = ඇමුණුම් පෙන්වන්න
pdfjs-attachments-button-label = ඇමුණුම්
pdfjs-layers-button =
    .title = ස්තර පෙන්වන්න (සියළු ස්තර පෙරනිමි තත්‍වයට යළි සැකසීමට දෙවරක් ඔබන්න)
pdfjs-layers-button-label = ස්තර
pdfjs-thumbs-button =
    .title = සිඟිති රූ පෙන්වන්න
pdfjs-thumbs-button-label = සිඟිති රූ
pdfjs-findbar-button =
    .title = ලේඛනයෙහි සොයන්න
pdfjs-findbar-button-label = සොයන්න
pdfjs-additional-layers = අතිරේක ස්තර

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = පිටුව { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = පිටුවේ සිඟිත රූව { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = සොයන්න
    .placeholder = ලේඛනයේ සොයන්න…
pdfjs-find-previous-button =
    .title = මෙම වැකිකඩ කලින් යෙදුණු ස්ථානය සොයන්න
pdfjs-find-previous-button-label = කලින්
pdfjs-find-next-button =
    .title = මෙම වැකිකඩ ඊළඟට යෙදෙන ස්ථානය සොයන්න
pdfjs-find-next-button-label = ඊළඟ
pdfjs-find-highlight-checkbox = සියල්ල උද්දීපනය
pdfjs-find-entire-word-checkbox-label = සමස්ත වචන
pdfjs-find-reached-top = ලේඛනයේ මුදුනට ළඟා විය, පහළ සිට ඉහළට
pdfjs-find-reached-bottom = ලේඛනයේ අවසානයට ළඟා විය, ඉහළ සිට පහළට
pdfjs-find-not-found = වැකිකඩ හමු නොවිණි

## Predefined zoom values

pdfjs-page-scale-width = පිටුවේ පළල
pdfjs-page-scale-auto = ස්වයංක්‍රීය විශාලනය
pdfjs-page-scale-actual = සැබෑ ප්‍රමාණය
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = පිටුව { $page }

## Loading indicator messages

pdfjs-loading-error = පීඩීඑෆ් පූරණය කිරීමේදී දෝෂයක් සිදු විය.
pdfjs-invalid-file-error = වලංගු නොවන හෝ හානිවූ පීඩීඑෆ් ගොනුවකි.
pdfjs-missing-file-error = මඟහැරුණු පීඩීඑෆ් ගොනුවකි.
pdfjs-unexpected-response-error = අනපේක්‍ෂිත සේවාදායක ප්‍රතිචාරයකි.

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date }, { $time }

## Password

pdfjs-password-label = මෙම පීඩීඑෆ් ගොනුව විවෘත කිරීමට මුරපදය යොදන්න.
pdfjs-password-invalid = වැරදි මුරපදයකි. නැවත උත්සාහ කරන්න.
pdfjs-password-ok-button = හරි
pdfjs-password-cancel-button = අවලංගු
pdfjs-web-fonts-disabled = වියමන අකුරු අබලයි: පීඩීඑෆ් වෙත කාවැද්දූ රුවකුරු භාවිතා කළ නොහැකිය.

## Editing

pdfjs-editor-free-text-button =
    .title = පෙළ
pdfjs-editor-free-text-button-label = පෙළ
pdfjs-editor-ink-button =
    .title = අඳින්න
pdfjs-editor-ink-button-label = අඳින්න
# Editor Parameters
pdfjs-editor-free-text-color-input = වර්ණය
pdfjs-editor-free-text-size-input = තරම
pdfjs-editor-ink-color-input = වර්ණය
pdfjs-editor-ink-thickness-input = ඝණකම
pdfjs-free-text =
    .aria-label = වදන් සකසනය
pdfjs-free-text-default-content = ලිවීීම අරඹන්න…

## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

