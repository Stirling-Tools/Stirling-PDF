# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = మునుపటి పేజీ
pdfjs-previous-button-label = క్రితం
pdfjs-next-button =
    .title = తరువాత పేజీ
pdfjs-next-button-label = తరువాత
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = పేజీ
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = మొత్తం { $pagesCount } లో
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = (మొత్తం { $pagesCount } లో { $pageNumber }వది)
pdfjs-zoom-out-button =
    .title = జూమ్ తగ్గించు
pdfjs-zoom-out-button-label = జూమ్ తగ్గించు
pdfjs-zoom-in-button =
    .title = జూమ్ చేయి
pdfjs-zoom-in-button-label = జూమ్ చేయి
pdfjs-zoom-select =
    .title = జూమ్
pdfjs-presentation-mode-button =
    .title = ప్రదర్శనా రీతికి మారు
pdfjs-presentation-mode-button-label = ప్రదర్శనా రీతి
pdfjs-open-file-button =
    .title = ఫైల్ తెరువు
pdfjs-open-file-button-label = తెరువు
pdfjs-print-button =
    .title = ముద్రించు
pdfjs-print-button-label = ముద్రించు

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = పనిముట్లు
pdfjs-tools-button-label = పనిముట్లు
pdfjs-first-page-button =
    .title = మొదటి పేజీకి వెళ్ళు
pdfjs-first-page-button-label = మొదటి పేజీకి వెళ్ళు
pdfjs-last-page-button =
    .title = చివరి పేజీకి వెళ్ళు
pdfjs-last-page-button-label = చివరి పేజీకి వెళ్ళు
pdfjs-page-rotate-cw-button =
    .title = సవ్యదిశలో తిప్పు
pdfjs-page-rotate-cw-button-label = సవ్యదిశలో తిప్పు
pdfjs-page-rotate-ccw-button =
    .title = అపసవ్యదిశలో తిప్పు
pdfjs-page-rotate-ccw-button-label = అపసవ్యదిశలో తిప్పు
pdfjs-cursor-text-select-tool-button =
    .title = టెక్స్ట్ ఎంపిక సాధనాన్ని ప్రారంభించండి
pdfjs-cursor-text-select-tool-button-label = టెక్స్ట్ ఎంపిక సాధనం
pdfjs-cursor-hand-tool-button =
    .title = చేతి సాధనం చేతనించు
pdfjs-cursor-hand-tool-button-label = చేతి సాధనం
pdfjs-scroll-vertical-button-label = నిలువు స్క్రోలింగు

## Document properties dialog

pdfjs-document-properties-button =
    .title = పత్రము లక్షణాలు...
pdfjs-document-properties-button-label = పత్రము లక్షణాలు...
pdfjs-document-properties-file-name = దస్త్రం పేరు:
pdfjs-document-properties-file-size = దస్త్రం పరిమాణం:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = శీర్షిక:
pdfjs-document-properties-author = మూలకర్త:
pdfjs-document-properties-subject = విషయం:
pdfjs-document-properties-keywords = కీ పదాలు:
pdfjs-document-properties-creation-date = సృష్టించిన తేదీ:
pdfjs-document-properties-modification-date = సవరించిన తేదీ:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = సృష్టికర్త:
pdfjs-document-properties-producer = PDF ఉత్పాదకి:
pdfjs-document-properties-version = PDF వర్షన్:
pdfjs-document-properties-page-count = పేజీల సంఖ్య:
pdfjs-document-properties-page-size = కాగితం పరిమాణం:
pdfjs-document-properties-page-size-unit-inches = లో
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = నిలువుచిత్రం
pdfjs-document-properties-page-size-orientation-landscape = అడ్డచిత్రం
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = లేఖ
pdfjs-document-properties-page-size-name-legal = చట్టపరమైన

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

pdfjs-document-properties-linearized-yes = అవును
pdfjs-document-properties-linearized-no = కాదు
pdfjs-document-properties-close-button = మూసివేయి

## Print

pdfjs-print-progress-message = ముద్రించడానికి పత్రము సిద్ధమవుతున్నది…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = రద్దుచేయి
pdfjs-printing-not-supported = హెచ్చరిక: ఈ విహారిణి చేత ముద్రణ పూర్తిగా తోడ్పాటు లేదు.
pdfjs-printing-not-ready = హెచ్చరిక: ముద్రణ కొరకు ఈ PDF పూర్తిగా లోడవలేదు.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = పక్కపట్టీ మార్చు
pdfjs-toggle-sidebar-button-label = పక్కపట్టీ మార్చు
pdfjs-document-outline-button =
    .title = పత్రము రూపము చూపించు (డబుల్ క్లిక్ చేసి అన్ని అంశాలను విస్తరించు/కూల్చు)
pdfjs-document-outline-button-label = పత్రము అవుట్‌లైన్
pdfjs-attachments-button =
    .title = అనుబంధాలు చూపు
pdfjs-attachments-button-label = అనుబంధాలు
pdfjs-layers-button-label = పొరలు
pdfjs-thumbs-button =
    .title = థంబ్‌నైల్స్ చూపు
pdfjs-thumbs-button-label = థంబ్‌నైల్స్
pdfjs-findbar-button =
    .title = పత్రములో కనుగొనుము
pdfjs-findbar-button-label = కనుగొను
pdfjs-additional-layers = అదనపు పొరలు

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = పేజీ { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page } పేజీ నఖచిత్రం

## Find panel button title and messages

pdfjs-find-input =
    .title = కనుగొను
    .placeholder = పత్రములో కనుగొను…
pdfjs-find-previous-button =
    .title = పదం యొక్క ముందు సంభవాన్ని కనుగొను
pdfjs-find-previous-button-label = మునుపటి
pdfjs-find-next-button =
    .title = పదం యొక్క తర్వాతి సంభవాన్ని కనుగొను
pdfjs-find-next-button-label = తరువాత
pdfjs-find-highlight-checkbox = అన్నిటిని ఉద్దీపనం చేయుము
pdfjs-find-match-case-checkbox-label = అక్షరముల తేడాతో పోల్చు
pdfjs-find-entire-word-checkbox-label = పూర్తి పదాలు
pdfjs-find-reached-top = పేజీ పైకి చేరుకున్నది, క్రింది నుండి కొనసాగించండి
pdfjs-find-reached-bottom = పేజీ చివరకు చేరుకున్నది, పైనుండి కొనసాగించండి
pdfjs-find-not-found = పదబంధం కనబడలేదు

## Predefined zoom values

pdfjs-page-scale-width = పేజీ వెడల్పు
pdfjs-page-scale-fit = పేజీ అమర్పు
pdfjs-page-scale-auto = స్వయంచాలక జూమ్
pdfjs-page-scale-actual = యథార్ధ పరిమాణం
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = PDF లోడవుచున్నప్పుడు ఒక దోషం ఎదురైంది.
pdfjs-invalid-file-error = చెల్లని లేదా పాడైన PDF ఫైలు.
pdfjs-missing-file-error = దొరకని PDF ఫైలు.
pdfjs-unexpected-response-error = అనుకోని సర్వర్ స్పందన.
pdfjs-rendering-error = పేజీను రెండర్ చేయుటలో ఒక దోషం ఎదురైంది.

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
    .alt = [{ $type } టీకా]

## Password

pdfjs-password-label = ఈ PDF ఫైల్ తెరుచుటకు సంకేతపదం ప్రవేశపెట్టుము.
pdfjs-password-invalid = సంకేతపదం చెల్లదు. దయచేసి మళ్ళీ ప్రయత్నించండి.
pdfjs-password-ok-button = సరే
pdfjs-password-cancel-button = రద్దుచేయి
pdfjs-web-fonts-disabled = వెబ్ ఫాంట్లు అచేతనించబడెను: ఎంబెడెడ్ PDF ఫాంట్లు ఉపయోగించలేక పోయింది.

## Editing

# Editor Parameters
pdfjs-editor-free-text-color-input = రంగు
pdfjs-editor-free-text-size-input = పరిమాణం
pdfjs-editor-ink-color-input = రంగు
pdfjs-editor-ink-thickness-input = మందం
pdfjs-editor-ink-opacity-input = అకిరణ్యత

## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

