# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = अघिल्लो पृष्ठ
pdfjs-previous-button-label = अघिल्लो
pdfjs-next-button =
    .title = पछिल्लो पृष्ठ
pdfjs-next-button-label = पछिल्लो
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = पृष्ठ
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } मध्ये
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pagesCount } को { $pageNumber })
pdfjs-zoom-out-button =
    .title = जुम घटाउनुहोस्
pdfjs-zoom-out-button-label = जुम घटाउनुहोस्
pdfjs-zoom-in-button =
    .title = जुम बढाउनुहोस्
pdfjs-zoom-in-button-label = जुम बढाउनुहोस्
pdfjs-zoom-select =
    .title = जुम गर्नुहोस्
pdfjs-presentation-mode-button =
    .title = प्रस्तुति मोडमा जानुहोस्
pdfjs-presentation-mode-button-label = प्रस्तुति मोड
pdfjs-open-file-button =
    .title = फाइल खोल्नुहोस्
pdfjs-open-file-button-label = खोल्नुहोस्
pdfjs-print-button =
    .title = मुद्रण गर्नुहोस्
pdfjs-print-button-label = मुद्रण गर्नुहोस्

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = औजारहरू
pdfjs-tools-button-label = औजारहरू
pdfjs-first-page-button =
    .title = पहिलो पृष्ठमा जानुहोस्
pdfjs-first-page-button-label = पहिलो पृष्ठमा जानुहोस्
pdfjs-last-page-button =
    .title = पछिल्लो पृष्ठमा जानुहोस्
pdfjs-last-page-button-label = पछिल्लो पृष्ठमा जानुहोस्
pdfjs-page-rotate-cw-button =
    .title = घडीको दिशामा घुमाउनुहोस्
pdfjs-page-rotate-cw-button-label = घडीको दिशामा घुमाउनुहोस्
pdfjs-page-rotate-ccw-button =
    .title = घडीको विपरित दिशामा घुमाउनुहोस्
pdfjs-page-rotate-ccw-button-label = घडीको विपरित दिशामा घुमाउनुहोस्
pdfjs-cursor-text-select-tool-button =
    .title = पाठ चयन उपकरण सक्षम गर्नुहोस्
pdfjs-cursor-text-select-tool-button-label = पाठ चयन उपकरण
pdfjs-cursor-hand-tool-button =
    .title = हाते उपकरण सक्षम गर्नुहोस्
pdfjs-cursor-hand-tool-button-label = हाते उपकरण
pdfjs-scroll-vertical-button =
    .title = ठाडो स्क्रोलिङ्ग प्रयोग गर्नुहोस्
pdfjs-scroll-vertical-button-label = ठाडो स्क्र्रोलिङ्ग
pdfjs-scroll-horizontal-button =
    .title = तेर्सो स्क्रोलिङ्ग प्रयोग गर्नुहोस्
pdfjs-scroll-horizontal-button-label = तेर्सो स्क्रोलिङ्ग
pdfjs-scroll-wrapped-button =
    .title = लिपि स्क्रोलिङ्ग प्रयोग गर्नुहोस्
pdfjs-scroll-wrapped-button-label = लिपि स्क्रोलिङ्ग
pdfjs-spread-none-button =
    .title = पृष्ठ स्प्रेडमा सामेल हुनुहुन्न
pdfjs-spread-none-button-label = स्प्रेड छैन

## Document properties dialog

pdfjs-document-properties-button =
    .title = कागजात विशेषताहरू...
pdfjs-document-properties-button-label = कागजात विशेषताहरू...
pdfjs-document-properties-file-name = फाइल नाम:
pdfjs-document-properties-file-size = फाइल आकार:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = शीर्षक:
pdfjs-document-properties-author = लेखक:
pdfjs-document-properties-subject = विषयः
pdfjs-document-properties-keywords = शब्दकुञ्जीः
pdfjs-document-properties-creation-date = सिर्जना गरिएको मिति:
pdfjs-document-properties-modification-date = परिमार्जित मिति:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = सर्जक:
pdfjs-document-properties-producer = PDF निर्माता:
pdfjs-document-properties-version = PDF संस्करण
pdfjs-document-properties-page-count = पृष्ठ गणना:
pdfjs-document-properties-page-size = पृष्ठ आकार:
pdfjs-document-properties-page-size-unit-inches = इन्च
pdfjs-document-properties-page-size-unit-millimeters = मि.मि.
pdfjs-document-properties-page-size-orientation-portrait = पोट्रेट
pdfjs-document-properties-page-size-orientation-landscape = परिदृश्य
pdfjs-document-properties-page-size-name-letter = अक्षर
pdfjs-document-properties-page-size-name-legal = कानूनी

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page


##

pdfjs-document-properties-linearized-yes = हो
pdfjs-document-properties-linearized-no = होइन
pdfjs-document-properties-close-button = बन्द गर्नुहोस्

## Print

pdfjs-print-progress-message = मुद्रणका लागि कागजात तयारी गरिदै…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = रद्द गर्नुहोस्
pdfjs-printing-not-supported = चेतावनी: यो ब्राउजरमा मुद्रण पूर्णतया समर्थित छैन।
pdfjs-printing-not-ready = चेतावनी: PDF मुद्रणका लागि पूर्णतया लोड भएको छैन।

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = टगल साइडबार
pdfjs-toggle-sidebar-button-label = टगल साइडबार
pdfjs-document-outline-button =
    .title = कागजातको रूपरेखा देखाउनुहोस् (सबै वस्तुहरू विस्तार/पतन गर्न डबल-क्लिक गर्नुहोस्)
pdfjs-document-outline-button-label = दस्तावेजको रूपरेखा
pdfjs-attachments-button =
    .title = संलग्नहरू देखाउनुहोस्
pdfjs-attachments-button-label = संलग्नकहरू
pdfjs-thumbs-button =
    .title = थम्बनेलहरू देखाउनुहोस्
pdfjs-thumbs-button-label = थम्बनेलहरू
pdfjs-findbar-button =
    .title = कागजातमा फेला पार्नुहोस्
pdfjs-findbar-button-label = फेला पार्नुहोस्

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = पृष्ठ { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page } पृष्ठको थम्बनेल

## Find panel button title and messages

pdfjs-find-input =
    .title = फेला पार्नुहोस्
    .placeholder = कागजातमा फेला पार्नुहोस्…
pdfjs-find-previous-button =
    .title = यस वाक्यांशको अघिल्लो घटना फेला पार्नुहोस्
pdfjs-find-previous-button-label = अघिल्लो
pdfjs-find-next-button =
    .title = यस वाक्यांशको पछिल्लो घटना फेला पार्नुहोस्
pdfjs-find-next-button-label = अर्को
pdfjs-find-highlight-checkbox = सबै हाइलाइट गर्ने
pdfjs-find-match-case-checkbox-label = केस जोडा मिलाउनुहोस्
pdfjs-find-entire-word-checkbox-label = पुरा शब्दहरु
pdfjs-find-reached-top = पृष्ठको शिर्षमा पुगीयो, तलबाट जारी गरिएको थियो
pdfjs-find-reached-bottom = पृष्ठको अन्त्यमा पुगीयो, शिर्षबाट जारी गरिएको थियो
pdfjs-find-not-found = वाक्यांश फेला परेन

## Predefined zoom values

pdfjs-page-scale-width = पृष्ठ चौडाइ
pdfjs-page-scale-fit = पृष्ठ ठिक्क मिल्ने
pdfjs-page-scale-auto = स्वचालित जुम
pdfjs-page-scale-actual = वास्तविक आकार
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = यो PDF लोड गर्दा एउटा त्रुटि देखापर्‍यो।
pdfjs-invalid-file-error = अवैध वा दुषित PDF फाइल।
pdfjs-missing-file-error = हराईरहेको PDF फाइल।
pdfjs-unexpected-response-error = अप्रत्याशित सर्भर प्रतिक्रिया।
pdfjs-rendering-error = पृष्ठ प्रतिपादन गर्दा एउटा त्रुटि देखापर्‍यो।

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } Annotation]

## Password

pdfjs-password-label = यस PDF फाइललाई खोल्न गोप्यशब्द प्रविष्ट गर्नुहोस्।
pdfjs-password-invalid = अवैध गोप्यशब्द। पुनः प्रयास गर्नुहोस्।
pdfjs-password-ok-button = ठिक छ
pdfjs-password-cancel-button = रद्द गर्नुहोस्
pdfjs-web-fonts-disabled = वेब फन्ट असक्षम छन्: एम्बेडेड PDF फन्ट प्रयोग गर्न असमर्थ।

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

