# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = ಹಿಂದಿನ ಪುಟ
pdfjs-previous-button-label = ಹಿಂದಿನ
pdfjs-next-button =
    .title = ಮುಂದಿನ ಪುಟ
pdfjs-next-button-label = ಮುಂದಿನ
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = ಪುಟ
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } ರಲ್ಲಿ
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pagesCount } ರಲ್ಲಿ { $pageNumber })
pdfjs-zoom-out-button =
    .title = ಕಿರಿದಾಗಿಸು
pdfjs-zoom-out-button-label = ಕಿರಿದಾಗಿಸಿ
pdfjs-zoom-in-button =
    .title = ಹಿರಿದಾಗಿಸು
pdfjs-zoom-in-button-label = ಹಿರಿದಾಗಿಸಿ
pdfjs-zoom-select =
    .title = ಗಾತ್ರಬದಲಿಸು
pdfjs-presentation-mode-button =
    .title = ಪ್ರಸ್ತುತಿ (ಪ್ರಸೆಂಟೇಶನ್) ಕ್ರಮಕ್ಕೆ ಬದಲಾಯಿಸು
pdfjs-presentation-mode-button-label = ಪ್ರಸ್ತುತಿ (ಪ್ರಸೆಂಟೇಶನ್) ಕ್ರಮ
pdfjs-open-file-button =
    .title = ಕಡತವನ್ನು ತೆರೆ
pdfjs-open-file-button-label = ತೆರೆಯಿರಿ
pdfjs-print-button =
    .title = ಮುದ್ರಿಸು
pdfjs-print-button-label = ಮುದ್ರಿಸಿ

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = ಉಪಕರಣಗಳು
pdfjs-tools-button-label = ಉಪಕರಣಗಳು
pdfjs-first-page-button =
    .title = ಮೊದಲ ಪುಟಕ್ಕೆ ತೆರಳು
pdfjs-first-page-button-label = ಮೊದಲ ಪುಟಕ್ಕೆ ತೆರಳು
pdfjs-last-page-button =
    .title = ಕೊನೆಯ ಪುಟಕ್ಕೆ ತೆರಳು
pdfjs-last-page-button-label = ಕೊನೆಯ ಪುಟಕ್ಕೆ ತೆರಳು
pdfjs-page-rotate-cw-button =
    .title = ಪ್ರದಕ್ಷಿಣೆಯಲ್ಲಿ ತಿರುಗಿಸು
pdfjs-page-rotate-cw-button-label = ಪ್ರದಕ್ಷಿಣೆಯಲ್ಲಿ ತಿರುಗಿಸು
pdfjs-page-rotate-ccw-button =
    .title = ಅಪ್ರದಕ್ಷಿಣೆಯಲ್ಲಿ ತಿರುಗಿಸು
pdfjs-page-rotate-ccw-button-label = ಅಪ್ರದಕ್ಷಿಣೆಯಲ್ಲಿ ತಿರುಗಿಸು
pdfjs-cursor-text-select-tool-button =
    .title = ಪಠ್ಯ ಆಯ್ಕೆ ಉಪಕರಣವನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಿ
pdfjs-cursor-text-select-tool-button-label = ಪಠ್ಯ ಆಯ್ಕೆಯ ಉಪಕರಣ
pdfjs-cursor-hand-tool-button =
    .title = ಕೈ ಉಪಕರಣವನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಿ
pdfjs-cursor-hand-tool-button-label = ಕೈ ಉಪಕರಣ

## Document properties dialog

pdfjs-document-properties-button =
    .title = ಡಾಕ್ಯುಮೆಂಟ್‌ ಗುಣಗಳು...
pdfjs-document-properties-button-label = ಡಾಕ್ಯುಮೆಂಟ್‌ ಗುಣಗಳು...
pdfjs-document-properties-file-name = ಕಡತದ ಹೆಸರು:
pdfjs-document-properties-file-size = ಕಡತದ ಗಾತ್ರ:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } ಬೈಟ್‍ಗಳು)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } ಬೈಟ್‍ಗಳು)
pdfjs-document-properties-title = ಶೀರ್ಷಿಕೆ:
pdfjs-document-properties-author = ಕರ್ತೃ:
pdfjs-document-properties-subject = ವಿಷಯ:
pdfjs-document-properties-keywords = ಮುಖ್ಯಪದಗಳು:
pdfjs-document-properties-creation-date = ರಚಿಸಿದ ದಿನಾಂಕ:
pdfjs-document-properties-modification-date = ಮಾರ್ಪಡಿಸಲಾದ ದಿನಾಂಕ:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = ರಚಿಸಿದವರು:
pdfjs-document-properties-producer = PDF ಉತ್ಪಾದಕ:
pdfjs-document-properties-version = PDF ಆವೃತ್ತಿ:
pdfjs-document-properties-page-count = ಪುಟದ ಎಣಿಕೆ:
pdfjs-document-properties-page-size-unit-inches = ಇದರಲ್ಲಿ
pdfjs-document-properties-page-size-orientation-portrait = ಭಾವಚಿತ್ರ
pdfjs-document-properties-page-size-orientation-landscape = ಪ್ರಕೃತಿ ಚಿತ್ರ

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page


##

pdfjs-document-properties-close-button = ಮುಚ್ಚು

## Print

pdfjs-print-progress-message = ಮುದ್ರಿಸುವುದಕ್ಕಾಗಿ ದಸ್ತಾವೇಜನ್ನು ಸಿದ್ಧಗೊಳಿಸಲಾಗುತ್ತಿದೆ…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = ರದ್ದು ಮಾಡು
pdfjs-printing-not-supported = ಎಚ್ಚರಿಕೆ: ಈ ಜಾಲವೀಕ್ಷಕದಲ್ಲಿ ಮುದ್ರಣಕ್ಕೆ ಸಂಪೂರ್ಣ ಬೆಂಬಲವಿಲ್ಲ.
pdfjs-printing-not-ready = ಎಚ್ಚರಿಕೆ: PDF ಕಡತವು ಮುದ್ರಿಸಲು ಸಂಪೂರ್ಣವಾಗಿ ಲೋಡ್ ಆಗಿಲ್ಲ.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = ಬದಿಪಟ್ಟಿಯನ್ನು ಹೊರಳಿಸು
pdfjs-toggle-sidebar-button-label = ಬದಿಪಟ್ಟಿಯನ್ನು ಹೊರಳಿಸು
pdfjs-document-outline-button-label = ದಸ್ತಾವೇಜಿನ ಹೊರರೇಖೆ
pdfjs-attachments-button =
    .title = ಲಗತ್ತುಗಳನ್ನು ತೋರಿಸು
pdfjs-attachments-button-label = ಲಗತ್ತುಗಳು
pdfjs-thumbs-button =
    .title = ಚಿಕ್ಕಚಿತ್ರದಂತೆ ತೋರಿಸು
pdfjs-thumbs-button-label = ಚಿಕ್ಕಚಿತ್ರಗಳು
pdfjs-findbar-button =
    .title = ದಸ್ತಾವೇಜಿನಲ್ಲಿ ಹುಡುಕು
pdfjs-findbar-button-label = ಹುಡುಕು

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = ಪುಟ { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = ಪುಟವನ್ನು ಚಿಕ್ಕಚಿತ್ರದಂತೆ ತೋರಿಸು { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = ಹುಡುಕು
    .placeholder = ದಸ್ತಾವೇಜಿನಲ್ಲಿ ಹುಡುಕು…
pdfjs-find-previous-button =
    .title = ವಾಕ್ಯದ ಹಿಂದಿನ ಇರುವಿಕೆಯನ್ನು ಹುಡುಕು
pdfjs-find-previous-button-label = ಹಿಂದಿನ
pdfjs-find-next-button =
    .title = ವಾಕ್ಯದ ಮುಂದಿನ ಇರುವಿಕೆಯನ್ನು ಹುಡುಕು
pdfjs-find-next-button-label = ಮುಂದಿನ
pdfjs-find-highlight-checkbox = ಎಲ್ಲವನ್ನು ಹೈಲೈಟ್ ಮಾಡು
pdfjs-find-match-case-checkbox-label = ಕೇಸನ್ನು ಹೊಂದಿಸು
pdfjs-find-reached-top = ದಸ್ತಾವೇಜಿನ ಮೇಲ್ಭಾಗವನ್ನು ತಲುಪಿದೆ, ಕೆಳಗಿನಿಂದ ಆರಂಭಿಸು
pdfjs-find-reached-bottom = ದಸ್ತಾವೇಜಿನ ಕೊನೆಯನ್ನು ತಲುಪಿದೆ, ಮೇಲಿನಿಂದ ಆರಂಭಿಸು
pdfjs-find-not-found = ವಾಕ್ಯವು ಕಂಡು ಬಂದಿಲ್ಲ

## Predefined zoom values

pdfjs-page-scale-width = ಪುಟದ ಅಗಲ
pdfjs-page-scale-fit = ಪುಟದ ಸರಿಹೊಂದಿಕೆ
pdfjs-page-scale-auto = ಸ್ವಯಂಚಾಲಿತ ಗಾತ್ರಬದಲಾವಣೆ
pdfjs-page-scale-actual = ನಿಜವಾದ ಗಾತ್ರ
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = PDF ಅನ್ನು ಲೋಡ್ ಮಾಡುವಾಗ ಒಂದು ದೋಷ ಎದುರಾಗಿದೆ.
pdfjs-invalid-file-error = ಅಮಾನ್ಯವಾದ ಅಥವ ಹಾಳಾದ PDF ಕಡತ.
pdfjs-missing-file-error = PDF ಕಡತ ಇಲ್ಲ.
pdfjs-unexpected-response-error = ಅನಿರೀಕ್ಷಿತವಾದ ಪೂರೈಕೆಗಣಕದ ಪ್ರತಿಕ್ರಿಯೆ.
pdfjs-rendering-error = ಪುಟವನ್ನು ನಿರೂಪಿಸುವಾಗ ಒಂದು ದೋಷ ಎದುರಾಗಿದೆ.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } ಟಿಪ್ಪಣಿ]

## Password

pdfjs-password-label = PDF ಅನ್ನು ತೆರೆಯಲು ಗುಪ್ತಪದವನ್ನು ನಮೂದಿಸಿ.
pdfjs-password-invalid = ಅಮಾನ್ಯವಾದ ಗುಪ್ತಪದ, ದಯವಿಟ್ಟು ಇನ್ನೊಮ್ಮೆ ಪ್ರಯತ್ನಿಸಿ.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = ರದ್ದು ಮಾಡು
pdfjs-web-fonts-disabled = ಜಾಲ ಅಕ್ಷರಶೈಲಿಯನ್ನು ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ: ಅಡಕಗೊಳಿಸಿದ PDF ಅಕ್ಷರಶೈಲಿಗಳನ್ನು ಬಳಸಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

