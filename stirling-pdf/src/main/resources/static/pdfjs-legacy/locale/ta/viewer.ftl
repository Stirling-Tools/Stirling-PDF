# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = முந்தைய பக்கம்
pdfjs-previous-button-label = முந்தையது
pdfjs-next-button =
    .title = அடுத்த பக்கம்
pdfjs-next-button-label = அடுத்து
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = பக்கம்
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } இல்
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = { $pagesCount }) இல் ({ $pageNumber }
pdfjs-zoom-out-button =
    .title = சிறிதாக்கு
pdfjs-zoom-out-button-label = சிறிதாக்கு
pdfjs-zoom-in-button =
    .title = பெரிதாக்கு
pdfjs-zoom-in-button-label = பெரிதாக்கு
pdfjs-zoom-select =
    .title = பெரிதாக்கு
pdfjs-presentation-mode-button =
    .title = விளக்ககாட்சி பயன்முறைக்கு மாறு
pdfjs-presentation-mode-button-label = விளக்ககாட்சி பயன்முறை
pdfjs-open-file-button =
    .title = கோப்பினை திற
pdfjs-open-file-button-label = திற
pdfjs-print-button =
    .title = அச்சிடு
pdfjs-print-button-label = அச்சிடு

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = கருவிகள்
pdfjs-tools-button-label = கருவிகள்
pdfjs-first-page-button =
    .title = முதல் பக்கத்திற்கு செல்லவும்
pdfjs-first-page-button-label = முதல் பக்கத்திற்கு செல்லவும்
pdfjs-last-page-button =
    .title = கடைசி பக்கத்திற்கு செல்லவும்
pdfjs-last-page-button-label = கடைசி பக்கத்திற்கு செல்லவும்
pdfjs-page-rotate-cw-button =
    .title = வலஞ்சுழியாக சுழற்று
pdfjs-page-rotate-cw-button-label = வலஞ்சுழியாக சுழற்று
pdfjs-page-rotate-ccw-button =
    .title = இடஞ்சுழியாக சுழற்று
pdfjs-page-rotate-ccw-button-label = இடஞ்சுழியாக சுழற்று
pdfjs-cursor-text-select-tool-button =
    .title = உரைத் தெரிவு கருவியைச் செயல்படுத்து
pdfjs-cursor-text-select-tool-button-label = உரைத் தெரிவு கருவி
pdfjs-cursor-hand-tool-button =
    .title = கைக் கருவிக்ச் செயற்படுத்து
pdfjs-cursor-hand-tool-button-label = கைக்குருவி

## Document properties dialog

pdfjs-document-properties-button =
    .title = ஆவண பண்புகள்...
pdfjs-document-properties-button-label = ஆவண பண்புகள்...
pdfjs-document-properties-file-name = கோப்பு பெயர்:
pdfjs-document-properties-file-size = கோப்பின் அளவு:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } கிபை ({ $size_b } பைட்டுகள்)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } மெபை ({ $size_b } பைட்டுகள்)
pdfjs-document-properties-title = தலைப்பு:
pdfjs-document-properties-author = எழுதியவர்
pdfjs-document-properties-subject = பொருள்:
pdfjs-document-properties-keywords = முக்கிய வார்த்தைகள்:
pdfjs-document-properties-creation-date = படைத்த தேதி :
pdfjs-document-properties-modification-date = திருத்திய தேதி:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = உருவாக்குபவர்:
pdfjs-document-properties-producer = பிடிஎஃப் தயாரிப்பாளர்:
pdfjs-document-properties-version = PDF பதிப்பு:
pdfjs-document-properties-page-count = பக்க எண்ணிக்கை:
pdfjs-document-properties-page-size = பக்க அளவு:
pdfjs-document-properties-page-size-unit-inches = இதில்
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = நிலைபதிப்பு
pdfjs-document-properties-page-size-orientation-landscape = நிலைபரப்பு
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = கடிதம்
pdfjs-document-properties-page-size-name-legal = சட்டபூர்வ

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

pdfjs-document-properties-close-button = மூடுக

## Print

pdfjs-print-progress-message = அச்சிடுவதற்கான ஆவணம் தயாராகிறது...
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = ரத்து
pdfjs-printing-not-supported = எச்சரிக்கை: இந்த உலாவி அச்சிடுதலை முழுமையாக ஆதரிக்கவில்லை.
pdfjs-printing-not-ready = எச்சரிக்கை: PDF அச்சிட முழுவதுமாக ஏற்றப்படவில்லை.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = பக்கப் பட்டியை நிலைமாற்று
pdfjs-toggle-sidebar-button-label = பக்கப் பட்டியை நிலைமாற்று
pdfjs-document-outline-button =
    .title = ஆவண அடக்கத்தைக் காட்டு (இருமுறைச் சொடுக்கி அனைத்து உறுப்பிடிகளையும் விரி/சேர்)
pdfjs-document-outline-button-label = ஆவண வெளிவரை
pdfjs-attachments-button =
    .title = இணைப்புகளை காண்பி
pdfjs-attachments-button-label = இணைப்புகள்
pdfjs-thumbs-button =
    .title = சிறுபடங்களைக் காண்பி
pdfjs-thumbs-button-label = சிறுபடங்கள்
pdfjs-findbar-button =
    .title = ஆவணத்தில் கண்டறி
pdfjs-findbar-button-label = தேடு

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = பக்கம் { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = பக்கத்தின் சிறுபடம் { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = கண்டுபிடி
    .placeholder = ஆவணத்தில் கண்டறி…
pdfjs-find-previous-button =
    .title = இந்த சொற்றொடரின் முந்தைய நிகழ்வை தேடு
pdfjs-find-previous-button-label = முந்தையது
pdfjs-find-next-button =
    .title = இந்த சொற்றொடரின் அடுத்த நிகழ்வை தேடு
pdfjs-find-next-button-label = அடுத்து
pdfjs-find-highlight-checkbox = அனைத்தையும் தனிப்படுத்து
pdfjs-find-match-case-checkbox-label = பேரெழுத்தாக்கத்தை உணர்
pdfjs-find-reached-top = ஆவணத்தின் மேல் பகுதியை அடைந்தது, அடிப்பக்கத்திலிருந்து தொடர்ந்தது
pdfjs-find-reached-bottom = ஆவணத்தின் முடிவை அடைந்தது, மேலிருந்து தொடர்ந்தது
pdfjs-find-not-found = சொற்றொடர் காணவில்லை

## Predefined zoom values

pdfjs-page-scale-width = பக்க அகலம்
pdfjs-page-scale-fit = பக்கப் பொருத்தம்
pdfjs-page-scale-auto = தானியக்க பெரிதாக்கல்
pdfjs-page-scale-actual = உண்மையான அளவு
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = PDF ஐ ஏற்றும் போது ஒரு பிழை ஏற்பட்டது.
pdfjs-invalid-file-error = செல்லுபடியாகாத அல்லது சிதைந்த PDF கோப்பு.
pdfjs-missing-file-error = PDF கோப்பு காணவில்லை.
pdfjs-unexpected-response-error = சேவகன் பதில் எதிர்பாரதது.
pdfjs-rendering-error = இந்தப் பக்கத்தை காட்சிப்படுத்தும் போது ஒரு பிழை ஏற்பட்டது.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } விளக்கம்]

## Password

pdfjs-password-label = இந்த PDF கோப்பை திறக்க கடவுச்சொல்லை உள்ளிடவும்.
pdfjs-password-invalid = செல்லுபடியாகாத கடவுச்சொல், தயை செய்து மீண்டும் முயற்சி செய்க.
pdfjs-password-ok-button = சரி
pdfjs-password-cancel-button = ரத்து
pdfjs-web-fonts-disabled = வலை எழுத்துருக்கள் முடக்கப்பட்டுள்ளன: உட்பொதிக்கப்பட்ட PDF எழுத்துருக்களைப் பயன்படுத்த முடியவில்லை.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

