# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Page Afore
pdfjs-previous-button-label = Previous
pdfjs-next-button =
    .title = Page Efter
pdfjs-next-button-label = Neist
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Page
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = o { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } o { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zoom Oot
pdfjs-zoom-out-button-label = Zoom Oot
pdfjs-zoom-in-button =
    .title = Zoom In
pdfjs-zoom-in-button-label = Zoom In
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Flit tae Presentation Mode
pdfjs-presentation-mode-button-label = Presentation Mode
pdfjs-open-file-button =
    .title = Open File
pdfjs-open-file-button-label = Open
pdfjs-print-button =
    .title = Prent
pdfjs-print-button-label = Prent

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Tools
pdfjs-tools-button-label = Tools
pdfjs-first-page-button =
    .title = Gang tae First Page
pdfjs-first-page-button-label = Gang tae First Page
pdfjs-last-page-button =
    .title = Gang tae Lest Page
pdfjs-last-page-button-label = Gang tae Lest Page
pdfjs-page-rotate-cw-button =
    .title = Rotate Clockwise
pdfjs-page-rotate-cw-button-label = Rotate Clockwise
pdfjs-page-rotate-ccw-button =
    .title = Rotate Coonterclockwise
pdfjs-page-rotate-ccw-button-label = Rotate Coonterclockwise
pdfjs-cursor-text-select-tool-button =
    .title = Enable Text Walin Tool
pdfjs-cursor-text-select-tool-button-label = Text Walin Tool
pdfjs-cursor-hand-tool-button =
    .title = Enable Haun Tool
pdfjs-cursor-hand-tool-button-label = Haun Tool
pdfjs-scroll-vertical-button =
    .title = Yaise Vertical Scrollin
pdfjs-scroll-vertical-button-label = Vertical Scrollin
pdfjs-scroll-horizontal-button =
    .title = Yaise Horizontal Scrollin
pdfjs-scroll-horizontal-button-label = Horizontal Scrollin
pdfjs-scroll-wrapped-button =
    .title = Yaise Wrapped Scrollin
pdfjs-scroll-wrapped-button-label = Wrapped Scrollin
pdfjs-spread-none-button =
    .title = Dinnae jyn page spreids
pdfjs-spread-none-button-label = Nae Spreids
pdfjs-spread-odd-button =
    .title = Jyn page spreids stertin wi odd-numbered pages
pdfjs-spread-odd-button-label = Odd Spreids
pdfjs-spread-even-button =
    .title = Jyn page spreids stertin wi even-numbered pages
pdfjs-spread-even-button-label = Even Spreids

## Document properties dialog

pdfjs-document-properties-button =
    .title = Document Properties…
pdfjs-document-properties-button-label = Document Properties…
pdfjs-document-properties-file-name = File nemme:
pdfjs-document-properties-file-size = File size:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Title:
pdfjs-document-properties-author = Author:
pdfjs-document-properties-subject = Subjeck:
pdfjs-document-properties-keywords = Keywirds:
pdfjs-document-properties-creation-date = Date o Makkin:
pdfjs-document-properties-modification-date = Date o Chynges:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Makker:
pdfjs-document-properties-producer = PDF Producer:
pdfjs-document-properties-version = PDF Version:
pdfjs-document-properties-page-count = Page Coont:
pdfjs-document-properties-page-size = Page Size:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = portrait
pdfjs-document-properties-page-size-orientation-landscape = landscape
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
pdfjs-document-properties-linearized = Fast Wab View:
pdfjs-document-properties-linearized-yes = Aye
pdfjs-document-properties-linearized-no = Naw
pdfjs-document-properties-close-button = Sneck

## Print

pdfjs-print-progress-message = Reddin document fur prentin…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Stap
pdfjs-printing-not-supported = Tak tent: Prentin isnae richt supportit by this stravaiger.
pdfjs-printing-not-ready = Tak tent: The PDF isnae richt loadit fur prentin.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Toggle Sidebaur
pdfjs-toggle-sidebar-notification-button =
    .title = Toggle Sidebaur (document conteens ootline/attachments/layers)
pdfjs-toggle-sidebar-button-label = Toggle Sidebaur
pdfjs-document-outline-button =
    .title = Kythe Document Ootline (double-click fur tae oot-fauld/in-fauld aw items)
pdfjs-document-outline-button-label = Document Ootline
pdfjs-attachments-button =
    .title = Kythe Attachments
pdfjs-attachments-button-label = Attachments
pdfjs-layers-button =
    .title = Kythe Layers (double-click fur tae reset aw layers tae the staunart state)
pdfjs-layers-button-label = Layers
pdfjs-thumbs-button =
    .title = Kythe Thumbnails
pdfjs-thumbs-button-label = Thumbnails
pdfjs-current-outline-item-button =
    .title = Find Current Ootline Item
pdfjs-current-outline-item-button-label = Current Ootline Item
pdfjs-findbar-button =
    .title = Find in Document
pdfjs-findbar-button-label = Find
pdfjs-additional-layers = Mair Layers

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Page { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Thumbnail o Page { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Find
    .placeholder = Find in document…
pdfjs-find-previous-button =
    .title = Airt oot the last time this phrase occurred
pdfjs-find-previous-button-label = Previous
pdfjs-find-next-button =
    .title = Airt oot the neist time this phrase occurs
pdfjs-find-next-button-label = Neist
pdfjs-find-highlight-checkbox = Highlicht aw
pdfjs-find-match-case-checkbox-label = Match case
pdfjs-find-entire-word-checkbox-label = Hale Wirds
pdfjs-find-reached-top = Raxed tap o document, went on fae the dowp end
pdfjs-find-reached-bottom = Raxed end o document, went on fae the tap
pdfjs-find-not-found = Phrase no fund

## Predefined zoom values

pdfjs-page-scale-width = Page Width
pdfjs-page-scale-fit = Page Fit
pdfjs-page-scale-auto = Automatic Zoom
pdfjs-page-scale-actual = Actual Size
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Page { $page }

## Loading indicator messages

pdfjs-loading-error = An mishanter tuik place while loadin the PDF.
pdfjs-invalid-file-error = No suithfest or camshauchlet PDF file.
pdfjs-missing-file-error = PDF file tint.
pdfjs-unexpected-response-error = Unexpectit server repone.
pdfjs-rendering-error = A mishanter tuik place while renderin the page.

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
    .alt = [{ $type } Annotation]

## Password

pdfjs-password-label = Inpit the passwird fur tae open this PDF file.
pdfjs-password-invalid = Passwird no suithfest. Gonnae gie it anither shot.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Stap
pdfjs-web-fonts-disabled = Wab fonts are disabled: cannae yaise embeddit PDF fonts.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

