# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = पिछला पृष्ठ
pdfjs-previous-button-label = पिछला
pdfjs-next-button =
    .title = अगला पृष्ठ
pdfjs-next-button-label = आगे
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = पृष्ठ:
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } का
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } of { $pagesCount })
pdfjs-zoom-out-button =
    .title = छोटा करें
pdfjs-zoom-out-button-label = छोटा करें
pdfjs-zoom-in-button =
    .title = बड़ा करें
pdfjs-zoom-in-button-label = बड़ा करें
pdfjs-zoom-select =
    .title = बड़ा-छोटा करें
pdfjs-presentation-mode-button =
    .title = प्रस्तुति अवस्था में जाएँ
pdfjs-presentation-mode-button-label = प्रस्तुति अवस्था
pdfjs-open-file-button =
    .title = फ़ाइल खोलें
pdfjs-open-file-button-label = खोलें
pdfjs-print-button =
    .title = छापें
pdfjs-print-button-label = छापें
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = ऐप में खोलें
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = ऐप में खोलें

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = औज़ार
pdfjs-tools-button-label = औज़ार
pdfjs-first-page-button =
    .title = प्रथम पृष्ठ पर जाएँ
pdfjs-first-page-button-label = प्रथम पृष्ठ पर जाएँ
pdfjs-last-page-button =
    .title = अंतिम पृष्ठ पर जाएँ
pdfjs-last-page-button-label = अंतिम पृष्ठ पर जाएँ
pdfjs-page-rotate-cw-button =
    .title = घड़ी की दिशा में घुमाएँ
pdfjs-page-rotate-cw-button-label = घड़ी की दिशा में घुमाएँ
pdfjs-page-rotate-ccw-button =
    .title = घड़ी की दिशा से उल्टा घुमाएँ
pdfjs-page-rotate-ccw-button-label = घड़ी की दिशा से उल्टा घुमाएँ
pdfjs-cursor-text-select-tool-button =
    .title = पाठ चयन उपकरण सक्षम करें
pdfjs-cursor-text-select-tool-button-label = पाठ चयन उपकरण
pdfjs-cursor-hand-tool-button =
    .title = हस्त उपकरण सक्षम करें
pdfjs-cursor-hand-tool-button-label = हस्त उपकरण
pdfjs-scroll-vertical-button =
    .title = लंबवत स्क्रॉलिंग का उपयोग करें
pdfjs-scroll-vertical-button-label = लंबवत स्क्रॉलिंग
pdfjs-scroll-horizontal-button =
    .title = क्षितिजिय स्क्रॉलिंग का उपयोग करें
pdfjs-scroll-horizontal-button-label = क्षितिजिय स्क्रॉलिंग
pdfjs-scroll-wrapped-button =
    .title = व्राप्पेड स्क्रॉलिंग का उपयोग करें
pdfjs-spread-none-button-label = कोई स्प्रेड उपलब्ध नहीं
pdfjs-spread-odd-button =
    .title = विषम-क्रमांकित पृष्ठों से प्रारंभ होने वाले पृष्ठ स्प्रेड में शामिल हों
pdfjs-spread-odd-button-label = विषम फैलाव

## Document properties dialog

pdfjs-document-properties-button =
    .title = दस्तावेज़ विशेषता...
pdfjs-document-properties-button-label = दस्तावेज़ विशेषता...
pdfjs-document-properties-file-name = फ़ाइल नाम:
pdfjs-document-properties-file-size = फाइल आकारः
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = शीर्षक:
pdfjs-document-properties-author = लेखकः
pdfjs-document-properties-subject = विषय:
pdfjs-document-properties-keywords = कुंजी-शब्द:
pdfjs-document-properties-creation-date = निर्माण दिनांक:
pdfjs-document-properties-modification-date = संशोधन दिनांक:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = निर्माता:
pdfjs-document-properties-producer = PDF उत्पादक:
pdfjs-document-properties-version = PDF संस्करण:
pdfjs-document-properties-page-count = पृष्ठ गिनती:
pdfjs-document-properties-page-size = पृष्ठ आकार:
pdfjs-document-properties-page-size-unit-inches = इंच
pdfjs-document-properties-page-size-unit-millimeters = मिमी
pdfjs-document-properties-page-size-orientation-portrait = पोर्ट्रेट
pdfjs-document-properties-page-size-orientation-landscape = लैंडस्केप
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = पत्र
pdfjs-document-properties-page-size-name-legal = क़ानूनी

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
pdfjs-document-properties-linearized = तीव्र वेब व्यू:
pdfjs-document-properties-linearized-yes = हाँ
pdfjs-document-properties-linearized-no = नहीं
pdfjs-document-properties-close-button = बंद करें

## Print

pdfjs-print-progress-message = छपाई के लिए दस्तावेज़ को तैयार किया जा रहा है...
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = रद्द करें
pdfjs-printing-not-supported = चेतावनी: इस ब्राउज़र पर छपाई पूरी तरह से समर्थित नहीं है.
pdfjs-printing-not-ready = चेतावनी: PDF छपाई के लिए पूरी तरह से लोड नहीं है.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = स्लाइडर टॉगल करें
pdfjs-toggle-sidebar-button-label = स्लाइडर टॉगल करें
pdfjs-document-outline-button =
    .title = दस्तावेज़ की रूपरेखा दिखाइए (सारी वस्तुओं को फलने अथवा समेटने के लिए दो बार क्लिक करें)
pdfjs-document-outline-button-label = दस्तावेज़ आउटलाइन
pdfjs-attachments-button =
    .title = संलग्नक दिखायें
pdfjs-attachments-button-label = संलग्नक
pdfjs-thumbs-button =
    .title = लघुछवियाँ दिखाएँ
pdfjs-thumbs-button-label = लघु छवि
pdfjs-findbar-button =
    .title = दस्तावेज़ में ढूँढ़ें
pdfjs-findbar-button-label = ढूँढें

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = पृष्ठ { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = पृष्ठ { $page } की लघु-छवि

## Find panel button title and messages

pdfjs-find-input =
    .title = ढूँढें
    .placeholder = दस्तावेज़ में खोजें...
pdfjs-find-previous-button =
    .title = वाक्यांश की पिछली उपस्थिति ढूँढ़ें
pdfjs-find-previous-button-label = पिछला
pdfjs-find-next-button =
    .title = वाक्यांश की अगली उपस्थिति ढूँढ़ें
pdfjs-find-next-button-label = अगला
pdfjs-find-highlight-checkbox = सभी आलोकित करें
pdfjs-find-match-case-checkbox-label = मिलान स्थिति
pdfjs-find-entire-word-checkbox-label = संपूर्ण शब्द
pdfjs-find-reached-top = पृष्ठ के ऊपर पहुंच गया, नीचे से जारी रखें
pdfjs-find-reached-bottom = पृष्ठ के नीचे में जा पहुँचा, ऊपर से जारी
pdfjs-find-not-found = वाक्यांश नहीं मिला

## Predefined zoom values

pdfjs-page-scale-width = पृष्ठ चौड़ाई
pdfjs-page-scale-fit = पृष्ठ फिट
pdfjs-page-scale-auto = स्वचालित जूम
pdfjs-page-scale-actual = वास्तविक आकार
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = PDF लोड करते समय एक त्रुटि हुई.
pdfjs-invalid-file-error = अमान्य या भ्रष्ट PDF फ़ाइल.
pdfjs-missing-file-error = अनुपस्थित PDF फ़ाइल.
pdfjs-unexpected-response-error = अप्रत्याशित सर्वर प्रतिक्रिया.
pdfjs-rendering-error = पृष्ठ रेंडरिंग के दौरान त्रुटि आई.

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

pdfjs-password-label = इस PDF फ़ाइल को खोलने के लिए कृपया कूटशब्द भरें.
pdfjs-password-invalid = अवैध कूटशब्द, कृपया फिर कोशिश करें.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = रद्द करें
pdfjs-web-fonts-disabled = वेब फॉन्ट्स निष्क्रिय हैं: अंतःस्थापित PDF फॉन्टस के उपयोग में असमर्थ.

## Editing

# Editor Parameters
pdfjs-editor-free-text-color-input = रंग

## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

