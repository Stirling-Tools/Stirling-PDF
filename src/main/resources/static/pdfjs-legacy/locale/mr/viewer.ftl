# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = मागील पृष्ठ
pdfjs-previous-button-label = मागील
pdfjs-next-button =
    .title = पुढील पृष्ठ
pdfjs-next-button-label = पुढील
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = पृष्ठ
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount }पैकी
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pagesCount } पैकी { $pageNumber })
pdfjs-zoom-out-button =
    .title = छोटे करा
pdfjs-zoom-out-button-label = छोटे करा
pdfjs-zoom-in-button =
    .title = मोठे करा
pdfjs-zoom-in-button-label = मोठे करा
pdfjs-zoom-select =
    .title = लहान किंवा मोठे करा
pdfjs-presentation-mode-button =
    .title = प्रस्तुतिकरण मोडचा वापर करा
pdfjs-presentation-mode-button-label = प्रस्तुतिकरण मोड
pdfjs-open-file-button =
    .title = फाइल उघडा
pdfjs-open-file-button-label = उघडा
pdfjs-print-button =
    .title = छपाई करा
pdfjs-print-button-label = छपाई करा

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = साधने
pdfjs-tools-button-label = साधने
pdfjs-first-page-button =
    .title = पहिल्या पृष्ठावर जा
pdfjs-first-page-button-label = पहिल्या पृष्ठावर जा
pdfjs-last-page-button =
    .title = शेवटच्या पृष्ठावर जा
pdfjs-last-page-button-label = शेवटच्या पृष्ठावर जा
pdfjs-page-rotate-cw-button =
    .title = घड्याळाच्या काट्याच्या दिशेने फिरवा
pdfjs-page-rotate-cw-button-label = घड्याळाच्या काट्याच्या दिशेने फिरवा
pdfjs-page-rotate-ccw-button =
    .title = घड्याळाच्या काट्याच्या उलट दिशेने फिरवा
pdfjs-page-rotate-ccw-button-label = घड्याळाच्या काट्याच्या उलट दिशेने फिरवा
pdfjs-cursor-text-select-tool-button =
    .title = मजकूर निवड साधन कार्यान्वयीत करा
pdfjs-cursor-text-select-tool-button-label = मजकूर निवड साधन
pdfjs-cursor-hand-tool-button =
    .title = हात साधन कार्यान्वित करा
pdfjs-cursor-hand-tool-button-label = हस्त साधन
pdfjs-scroll-vertical-button =
    .title = अनुलंब स्क्रोलिंग वापरा
pdfjs-scroll-vertical-button-label = अनुलंब स्क्रोलिंग
pdfjs-scroll-horizontal-button =
    .title = क्षैतिज स्क्रोलिंग वापरा
pdfjs-scroll-horizontal-button-label = क्षैतिज स्क्रोलिंग

## Document properties dialog

pdfjs-document-properties-button =
    .title = दस्तऐवज गुणधर्म…
pdfjs-document-properties-button-label = दस्तऐवज गुणधर्म…
pdfjs-document-properties-file-name = फाइलचे नाव:
pdfjs-document-properties-file-size = फाइल आकार:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } बाइट्स)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } बाइट्स)
pdfjs-document-properties-title = शिर्षक:
pdfjs-document-properties-author = लेखक:
pdfjs-document-properties-subject = विषय:
pdfjs-document-properties-keywords = मुख्यशब्द:
pdfjs-document-properties-creation-date = निर्माण दिनांक:
pdfjs-document-properties-modification-date = दुरूस्ती दिनांक:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = निर्माता:
pdfjs-document-properties-producer = PDF निर्माता:
pdfjs-document-properties-version = PDF आवृत्ती:
pdfjs-document-properties-page-count = पृष्ठ संख्या:
pdfjs-document-properties-page-size = पृष्ठ आकार:
pdfjs-document-properties-page-size-unit-inches = इंच
pdfjs-document-properties-page-size-unit-millimeters = मीमी
pdfjs-document-properties-page-size-orientation-portrait = उभी मांडणी
pdfjs-document-properties-page-size-orientation-landscape = आडवे
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
pdfjs-document-properties-linearized = जलद वेब दृष्य:
pdfjs-document-properties-linearized-yes = हो
pdfjs-document-properties-linearized-no = नाही
pdfjs-document-properties-close-button = बंद करा

## Print

pdfjs-print-progress-message = छपाई करीता पृष्ठ तयार करीत आहे…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = रद्द करा
pdfjs-printing-not-supported = सावधानता: या ब्राउझरतर्फे छपाइ पूर्णपणे समर्थीत नाही.
pdfjs-printing-not-ready = सावधानता: छपाईकरिता PDF पूर्णतया लोड झाले नाही.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = बाजूचीपट्टी टॉगल करा
pdfjs-toggle-sidebar-button-label = बाजूचीपट्टी टॉगल करा
pdfjs-document-outline-button =
    .title = दस्तऐवज बाह्यरेखा दर्शवा (विस्तृत करण्यासाठी दोनवेळा क्लिक करा /सर्व घटक दाखवा)
pdfjs-document-outline-button-label = दस्तऐवज रूपरेषा
pdfjs-attachments-button =
    .title = जोडपत्र दाखवा
pdfjs-attachments-button-label = जोडपत्र
pdfjs-thumbs-button =
    .title = थंबनेल्स् दाखवा
pdfjs-thumbs-button-label = थंबनेल्स्
pdfjs-findbar-button =
    .title = दस्तऐवजात शोधा
pdfjs-findbar-button-label = शोधा

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = पृष्ठ { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = पृष्ठाचे थंबनेल { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = शोधा
    .placeholder = दस्तऐवजात शोधा…
pdfjs-find-previous-button =
    .title = वाकप्रयोगची मागील घटना शोधा
pdfjs-find-previous-button-label = मागील
pdfjs-find-next-button =
    .title = वाकप्रयोगची पुढील घटना शोधा
pdfjs-find-next-button-label = पुढील
pdfjs-find-highlight-checkbox = सर्व ठळक करा
pdfjs-find-match-case-checkbox-label = आकार जुळवा
pdfjs-find-entire-word-checkbox-label = संपूर्ण शब्द
pdfjs-find-reached-top = दस्तऐवजाच्या शीर्षकास पोहचले, तळपासून पुढे
pdfjs-find-reached-bottom = दस्तऐवजाच्या तळाला पोहचले, शीर्षकापासून पुढे
pdfjs-find-not-found = वाकप्रयोग आढळले नाही

## Predefined zoom values

pdfjs-page-scale-width = पृष्ठाची रूंदी
pdfjs-page-scale-fit = पृष्ठ बसवा
pdfjs-page-scale-auto = स्वयं लाहन किंवा मोठे करणे
pdfjs-page-scale-actual = प्रत्यक्ष आकार
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = PDF लोड करतेवेळी त्रुटी आढळली.
pdfjs-invalid-file-error = अवैध किंवा दोषीत PDF फाइल.
pdfjs-missing-file-error = न आढळणारी PDF फाइल.
pdfjs-unexpected-response-error = अनपेक्षित सर्व्हर प्रतिसाद.
pdfjs-rendering-error = पृष्ठ दाखवतेवेळी त्रुटी आढळली.

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
    .alt = [{ $type } टिपण्णी]

## Password

pdfjs-password-label = ही PDF फाइल उघडण्याकरिता पासवर्ड द्या.
pdfjs-password-invalid = अवैध पासवर्ड. कृपया पुन्हा प्रयत्न करा.
pdfjs-password-ok-button = ठीक आहे
pdfjs-password-cancel-button = रद्द करा
pdfjs-web-fonts-disabled = वेब टंक असमर्थीत आहेत: एम्बेडेड PDF टंक वापर अशक्य.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

