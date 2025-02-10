# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = પહેલાનુ પાનું
pdfjs-previous-button-label = પહેલાનુ
pdfjs-next-button =
    .title = આગળનુ પાનું
pdfjs-next-button-label = આગળનું
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = પાનું
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = નો { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } નો { $pagesCount })
pdfjs-zoom-out-button =
    .title = મોટુ કરો
pdfjs-zoom-out-button-label = મોટુ કરો
pdfjs-zoom-in-button =
    .title = નાનું કરો
pdfjs-zoom-in-button-label = નાનું કરો
pdfjs-zoom-select =
    .title = નાનું મોટુ કરો
pdfjs-presentation-mode-button =
    .title = રજૂઆત સ્થિતિમાં જાવ
pdfjs-presentation-mode-button-label = રજૂઆત સ્થિતિ
pdfjs-open-file-button =
    .title = ફાઇલ ખોલો
pdfjs-open-file-button-label = ખોલો
pdfjs-print-button =
    .title = છાપો
pdfjs-print-button-label = છારો

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = સાધનો
pdfjs-tools-button-label = સાધનો
pdfjs-first-page-button =
    .title = પહેલાં પાનામાં જાવ
pdfjs-first-page-button-label = પ્રથમ પાનાં પર જાવ
pdfjs-last-page-button =
    .title = છેલ્લા પાનાં પર જાવ
pdfjs-last-page-button-label = છેલ્લા પાનાં પર જાવ
pdfjs-page-rotate-cw-button =
    .title = ઘડિયાળનાં કાંટા તરફ ફેરવો
pdfjs-page-rotate-cw-button-label = ઘડિયાળનાં કાંટા તરફ ફેરવો
pdfjs-page-rotate-ccw-button =
    .title = ઘડિયાળનાં કાંટાની ઉલટી દિશામાં ફેરવો
pdfjs-page-rotate-ccw-button-label = ઘડિયાળનાં કાંટાની વિરુદ્દ ફેરવો
pdfjs-cursor-text-select-tool-button =
    .title = ટેક્સ્ટ પસંદગી ટૂલ સક્ષમ કરો
pdfjs-cursor-text-select-tool-button-label = ટેક્સ્ટ પસંદગી ટૂલ
pdfjs-cursor-hand-tool-button =
    .title = હાથનાં સાધનને સક્રિય કરો
pdfjs-cursor-hand-tool-button-label = હેન્ડ ટૂલ
pdfjs-scroll-vertical-button =
    .title = ઊભી સ્ક્રોલિંગનો ઉપયોગ કરો
pdfjs-scroll-vertical-button-label = ઊભી સ્ક્રોલિંગ
pdfjs-scroll-horizontal-button =
    .title = આડી સ્ક્રોલિંગનો ઉપયોગ કરો
pdfjs-scroll-horizontal-button-label = આડી સ્ક્રોલિંગ
pdfjs-scroll-wrapped-button =
    .title = આવરિત સ્ક્રોલિંગનો ઉપયોગ કરો
pdfjs-scroll-wrapped-button-label = આવરિત સ્ક્રોલિંગ
pdfjs-spread-none-button =
    .title = પૃષ્ઠ સ્પ્રેડમાં જોડાવશો નહીં
pdfjs-spread-none-button-label = કોઈ સ્પ્રેડ નથી
pdfjs-spread-odd-button =
    .title = એકી-ક્રમાંકિત પૃષ્ઠો સાથે પ્રારંભ થતાં પૃષ્ઠ સ્પ્રેડમાં જોડાઓ
pdfjs-spread-odd-button-label = એકી સ્પ્રેડ્સ
pdfjs-spread-even-button =
    .title = નંબર-ક્રમાંકિત પૃષ્ઠોથી શરૂ થતાં પૃષ્ઠ સ્પ્રેડમાં જોડાઓ
pdfjs-spread-even-button-label = સરખું ફેલાવવું

## Document properties dialog

pdfjs-document-properties-button =
    .title = દસ્તાવેજ ગુણધર્મો…
pdfjs-document-properties-button-label = દસ્તાવેજ ગુણધર્મો…
pdfjs-document-properties-file-name = ફાઇલ નામ:
pdfjs-document-properties-file-size = ફાઇલ માપ:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } બાઇટ)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } બાઇટ)
pdfjs-document-properties-title = શીર્ષક:
pdfjs-document-properties-author = લેખક:
pdfjs-document-properties-subject = વિષય:
pdfjs-document-properties-keywords = કિવર્ડ:
pdfjs-document-properties-creation-date = નિર્માણ તારીખ:
pdfjs-document-properties-modification-date = ફેરફાર તારીખ:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = નિર્માતા:
pdfjs-document-properties-producer = PDF નિર્માતા:
pdfjs-document-properties-version = PDF આવૃત્તિ:
pdfjs-document-properties-page-count = પાનાં ગણતરી:
pdfjs-document-properties-page-size = પૃષ્ઠનું કદ:
pdfjs-document-properties-page-size-unit-inches = ઇંચ
pdfjs-document-properties-page-size-unit-millimeters = મીમી
pdfjs-document-properties-page-size-orientation-portrait = ઉભું
pdfjs-document-properties-page-size-orientation-landscape = આડુ
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = પત્ર
pdfjs-document-properties-page-size-name-legal = કાયદાકીય

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
pdfjs-document-properties-linearized = ઝડપી વૅબ દૃશ્ય:
pdfjs-document-properties-linearized-yes = હા
pdfjs-document-properties-linearized-no = ના
pdfjs-document-properties-close-button = બંધ કરો

## Print

pdfjs-print-progress-message = છાપકામ માટે દસ્તાવેજ તૈયાર કરી રહ્યા છે…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = રદ કરો
pdfjs-printing-not-supported = ચેતવણી: છાપવાનું આ બ્રાઉઝર દ્દારા સંપૂર્ણપણે આધારભૂત નથી.
pdfjs-printing-not-ready = Warning: PDF એ છાપવા માટે સંપૂર્ણપણે લાવેલ છે.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = ટૉગલ બાજુપટ્ટી
pdfjs-toggle-sidebar-button-label = ટૉગલ બાજુપટ્ટી
pdfjs-document-outline-button =
    .title = દસ્તાવેજની રૂપરેખા બતાવો(બધી આઇટમ્સને વિસ્તૃત/સંકુચિત કરવા માટે ડબલ-ક્લિક કરો)
pdfjs-document-outline-button-label = દસ્તાવેજ રૂપરેખા
pdfjs-attachments-button =
    .title = જોડાણોને બતાવો
pdfjs-attachments-button-label = જોડાણો
pdfjs-thumbs-button =
    .title = થંબનેલ્સ બતાવો
pdfjs-thumbs-button-label = થંબનેલ્સ
pdfjs-findbar-button =
    .title = દસ્તાવેજમાં શોધો
pdfjs-findbar-button-label = શોધો

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = પાનું { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = પાનાં { $page } નું થંબનેલ્સ

## Find panel button title and messages

pdfjs-find-input =
    .title = શોધો
    .placeholder = દસ્તાવેજમાં શોધો…
pdfjs-find-previous-button =
    .title = શબ્દસમૂહની પાછલી ઘટનાને શોધો
pdfjs-find-previous-button-label = પહેલાંનુ
pdfjs-find-next-button =
    .title = શબ્દસમૂહની આગળની ઘટનાને શોધો
pdfjs-find-next-button-label = આગળનું
pdfjs-find-highlight-checkbox = બધુ પ્રકાશિત કરો
pdfjs-find-match-case-checkbox-label = કેસ બંધબેસાડો
pdfjs-find-entire-word-checkbox-label = સંપૂર્ણ શબ્દો
pdfjs-find-reached-top = દસ્તાવેજનાં ટોચે પહોંચી ગયા, તળિયેથી ચાલુ કરેલ હતુ
pdfjs-find-reached-bottom = દસ્તાવેજનાં અંતે પહોંચી ગયા, ઉપરથી ચાલુ કરેલ હતુ
pdfjs-find-not-found = શબ્દસમૂહ મળ્યુ નથી

## Predefined zoom values

pdfjs-page-scale-width = પાનાની પહોળાઇ
pdfjs-page-scale-fit = પાનું બંધબેસતુ
pdfjs-page-scale-auto = આપમેળે નાનુંમોટુ કરો
pdfjs-page-scale-actual = ચોક્કસ માપ
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = ભૂલ ઉદ્ભવી જ્યારે PDF ને લાવી રહ્યા હોય.
pdfjs-invalid-file-error = અયોગ્ય અથવા ભાંગેલ PDF ફાઇલ.
pdfjs-missing-file-error = ગુમ થયેલ PDF ફાઇલ.
pdfjs-unexpected-response-error = અનપેક્ષિત સર્વર પ્રતિસાદ.
pdfjs-rendering-error = ભૂલ ઉદ્ભવી જ્યારે પાનાંનુ રેન્ડ કરી રહ્યા હોય.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } Annotation]

## Password

pdfjs-password-label = આ PDF ફાઇલને ખોલવા પાસવર્ડને દાખલ કરો.
pdfjs-password-invalid = અયોગ્ય પાસવર્ડ. મહેરબાની કરીને ફરી પ્રયત્ન કરો.
pdfjs-password-ok-button = બરાબર
pdfjs-password-cancel-button = રદ કરો
pdfjs-web-fonts-disabled = વેબ ફોન્ટ નિષ્ક્રિય થયેલ છે: ઍમ્બેડ થયેલ PDF ફોન્ટને વાપરવાનું અસમર્થ.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

