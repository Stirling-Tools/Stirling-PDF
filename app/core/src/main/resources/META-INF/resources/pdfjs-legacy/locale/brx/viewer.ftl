# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = आगोलनि बिलाइ
pdfjs-previous-button-label = आगोलनि
pdfjs-next-button =
    .title = उननि बिलाइ
pdfjs-next-button-label = उननि
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = बिलाइ
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } नि
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pagesCount } नि { $pageNumber })
pdfjs-zoom-out-button =
    .title = फिसायै जुम खालाम
pdfjs-zoom-out-button-label = फिसायै जुम खालाम
pdfjs-zoom-in-button =
    .title = गेदेरै जुम खालाम
pdfjs-zoom-in-button-label = गेदेरै जुम खालाम
pdfjs-zoom-select =
    .title = जुम खालाम
pdfjs-presentation-mode-button =
    .title = दिन्थिफुंनाय म'डआव थां
pdfjs-presentation-mode-button-label = दिन्थिफुंनाय म'ड
pdfjs-open-file-button =
    .title = फाइलखौ खेव
pdfjs-open-file-button-label = खेव
pdfjs-print-button =
    .title = साफाय
pdfjs-print-button-label = साफाय

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = टुल
pdfjs-tools-button-label = टुल
pdfjs-first-page-button =
    .title = गिबि बिलाइआव थां
pdfjs-first-page-button-label = गिबि बिलाइआव थां
pdfjs-last-page-button =
    .title = जोबथा बिलाइआव थां
pdfjs-last-page-button-label = जोबथा बिलाइआव थां
pdfjs-page-rotate-cw-button =
    .title = घरि गिदिंनाय फार्से फिदिं
pdfjs-page-rotate-cw-button-label = घरि गिदिंनाय फार्से फिदिं
pdfjs-page-rotate-ccw-button =
    .title = घरि गिदिंनाय उल्था फार्से फिदिं
pdfjs-page-rotate-ccw-button-label = घरि गिदिंनाय उल्था फार्से फिदिं

## Document properties dialog

pdfjs-document-properties-button =
    .title = फोरमान बिलाइनि आखुथाय...
pdfjs-document-properties-button-label = फोरमान बिलाइनि आखुथाय...
pdfjs-document-properties-file-name = फाइलनि मुं:
pdfjs-document-properties-file-size = फाइलनि महर:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } बाइट)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } बाइट)
pdfjs-document-properties-title = बिमुं:
pdfjs-document-properties-author = लिरगिरि:
pdfjs-document-properties-subject = आयदा:
pdfjs-document-properties-keywords = गाहाय सोदोब:
pdfjs-document-properties-creation-date = सोरजिनाय अक्ट':
pdfjs-document-properties-modification-date = सुद्रायनाय अक्ट':
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = सोरजिग्रा:
pdfjs-document-properties-producer = PDF दिहुनग्रा:
pdfjs-document-properties-version = PDF बिसान:
pdfjs-document-properties-page-count = बिलाइनि हिसाब:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = प'र्ट्रेट
pdfjs-document-properties-page-size-orientation-landscape = लेण्डस्केप
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = लायजाम

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

pdfjs-document-properties-linearized-yes = नंगौ
pdfjs-document-properties-linearized-no = नङा
pdfjs-document-properties-close-button = बन्द खालाम

## Print

# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = नेवसि
pdfjs-printing-not-supported = सांग्रांथि: साफायनाया बे ब्राउजारजों आबुङै हेफाजाब होजाया।
pdfjs-printing-not-ready = सांग्रांथि: PDF खौ साफायनायनि थाखाय फुरायै ल'ड खालामाखै।

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = टग्गल साइडबार
pdfjs-toggle-sidebar-button-label = टग्गल साइडबार
pdfjs-document-outline-button-label = फोरमान बिलाइ सिमा हांखो
pdfjs-attachments-button =
    .title = नांजाब होनायखौ दिन्थि
pdfjs-attachments-button-label = नांजाब होनाय
pdfjs-thumbs-button =
    .title = थामनेइलखौ दिन्थि
pdfjs-thumbs-button-label = थामनेइल
pdfjs-findbar-button =
    .title = फोरमान बिलाइआव नागिरना दिहुन
pdfjs-findbar-button-label = नायगिरना दिहुन

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = बिलाइ { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = बिलाइ { $page } नि थामनेइल

## Find panel button title and messages

pdfjs-find-input =
    .title = नायगिरना दिहुन
    .placeholder = फोरमान बिलाइआव नागिरना दिहुन...
pdfjs-find-previous-button =
    .title = बाथ्रा खोन्दोबनि सिगांनि नुजाथिनायखौ नागिर
pdfjs-find-previous-button-label = आगोलनि
pdfjs-find-next-button =
    .title = बाथ्रा खोन्दोबनि उननि नुजाथिनायखौ नागिर
pdfjs-find-next-button-label = उननि
pdfjs-find-highlight-checkbox = गासैखौबो हाइलाइट खालाम
pdfjs-find-match-case-checkbox-label = गोरोबनाय केस
pdfjs-find-reached-top = थालो निफ्राय जागायनानै फोरमान बिलाइनि बिजौआव सौहैबाय
pdfjs-find-reached-bottom = बिजौ निफ्राय जागायनानै फोरमान बिलाइनि बिजौआव सौहैबाय
pdfjs-find-not-found = बाथ्रा खोन्दोब मोनाखै

## Predefined zoom values

pdfjs-page-scale-width = बिलाइनि गुवार
pdfjs-page-scale-fit = बिलाइ गोरोबनाय
pdfjs-page-scale-auto = गावनोगाव जुम
pdfjs-page-scale-actual = थार महर
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = PDF ल'ड खालामनाय समाव मोनसे गोरोन्थि जाबाय।
pdfjs-invalid-file-error = बाहायजायै एबा गाज्रि जानाय PDF फाइल
pdfjs-missing-file-error = गोमानाय PDF फाइल
pdfjs-unexpected-response-error = मिजिंथियै सार्भार फिननाय।
pdfjs-rendering-error = बिलाइखौ राव सोलायनाय समाव मोनसे गोरोन्थि जादों।

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
    .alt = [{ $type } सोदोब बेखेवनाय]

## Password

pdfjs-password-label = बे PDF फाइलखौ खेवनो पासवार्ड हाबहो।
pdfjs-password-invalid = बाहायजायै पासवार्ड। अननानै फिन नाजा।
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = नेवसि
pdfjs-web-fonts-disabled = वेब फन्टखौ लोरबां खालामबाय: अरजाबहोनाय PDF फन्टखौ बाहायनो हायाखै।

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

