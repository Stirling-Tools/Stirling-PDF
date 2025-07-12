# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pajenn a-raok
pdfjs-previous-button-label = A-raok
pdfjs-next-button =
    .title = Pajenn war-lerc'h
pdfjs-next-button-label = War-lerc'h
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pajenn
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = eus { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } war { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zoum bihanaat
pdfjs-zoom-out-button-label = Zoum bihanaat
pdfjs-zoom-in-button =
    .title = Zoum brasaat
pdfjs-zoom-in-button-label = Zoum brasaat
pdfjs-zoom-select =
    .title = Zoum
pdfjs-presentation-mode-button =
    .title = Trec'haoliñ etrezek ar mod kinnigadenn
pdfjs-presentation-mode-button-label = Mod kinnigadenn
pdfjs-open-file-button =
    .title = Digeriñ ur restr
pdfjs-open-file-button-label = Digeriñ ur restr
pdfjs-print-button =
    .title = Moullañ
pdfjs-print-button-label = Moullañ
pdfjs-save-button =
    .title = Enrollañ
pdfjs-save-button-label = Enrollañ
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Pellgargañ
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Pellgargañ
pdfjs-bookmark-button-label = Pajenn a-vremañ
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Digeriñ en arload
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Digeriñ en arload

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Ostilhoù
pdfjs-tools-button-label = Ostilhoù
pdfjs-first-page-button =
    .title = Mont d'ar bajenn gentañ
pdfjs-first-page-button-label = Mont d'ar bajenn gentañ
pdfjs-last-page-button =
    .title = Mont d'ar bajenn diwezhañ
pdfjs-last-page-button-label = Mont d'ar bajenn diwezhañ
pdfjs-page-rotate-cw-button =
    .title = C'hwelañ gant roud ar bizied
pdfjs-page-rotate-cw-button-label = C'hwelañ gant roud ar bizied
pdfjs-page-rotate-ccw-button =
    .title = C'hwelañ gant roud gin ar bizied
pdfjs-page-rotate-ccw-button-label = C'hwelañ gant roud gin ar bizied
pdfjs-cursor-text-select-tool-button =
    .title = Gweredekaat an ostilh diuzañ testenn
pdfjs-cursor-text-select-tool-button-label = Ostilh diuzañ testenn
pdfjs-cursor-hand-tool-button =
    .title = Gweredekaat an ostilh dorn
pdfjs-cursor-hand-tool-button-label = Ostilh dorn
pdfjs-scroll-vertical-button =
    .title = Arverañ an dibunañ a-blom
pdfjs-scroll-vertical-button-label = Dibunañ a-serzh
pdfjs-scroll-horizontal-button =
    .title = Arverañ an dibunañ a-blaen
pdfjs-scroll-horizontal-button-label = Dibunañ a-blaen
pdfjs-scroll-wrapped-button =
    .title = Arverañ an dibunañ paket
pdfjs-scroll-wrapped-button-label = Dibunañ paket
pdfjs-spread-none-button =
    .title = Chom hep stagañ ar skignadurioù
pdfjs-spread-none-button-label = Skignadenn ebet
pdfjs-spread-odd-button =
    .title = Lakaat ar pajennadoù en ur gregiñ gant ar pajennoù ampar
pdfjs-spread-odd-button-label = Pajennoù ampar
pdfjs-spread-even-button =
    .title = Lakaat ar pajennadoù en ur gregiñ gant ar pajennoù par
pdfjs-spread-even-button-label = Pajennoù par

## Document properties dialog

pdfjs-document-properties-button =
    .title = Perzhioù an teul…
pdfjs-document-properties-button-label = Perzhioù an teul…
pdfjs-document-properties-file-name = Anv restr:
pdfjs-document-properties-file-size = Ment ar restr:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } Ke ({ $size_b } eizhbit)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } Me ({ $size_b } eizhbit)
pdfjs-document-properties-title = Titl:
pdfjs-document-properties-author = Aozer:
pdfjs-document-properties-subject = Danvez:
pdfjs-document-properties-keywords = Gerioù-alc'hwez:
pdfjs-document-properties-creation-date = Deiziad krouiñ:
pdfjs-document-properties-modification-date = Deiziad kemmañ:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Krouer:
pdfjs-document-properties-producer = Kenderc'her PDF:
pdfjs-document-properties-version = Handelv PDF:
pdfjs-document-properties-page-count = Niver a bajennoù:
pdfjs-document-properties-page-size = Ment ar bajenn:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = poltred
pdfjs-document-properties-page-size-orientation-landscape = gweledva
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Lizher
pdfjs-document-properties-page-size-name-legal = Lezennel

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
pdfjs-document-properties-linearized = Gwel Web Herrek:
pdfjs-document-properties-linearized-yes = Ya
pdfjs-document-properties-linearized-no = Ket
pdfjs-document-properties-close-button = Serriñ

## Print

pdfjs-print-progress-message = O prientiñ an teul evit moullañ...
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Nullañ
pdfjs-printing-not-supported = Kemenn: N'eo ket skoret penn-da-benn ar moullañ gant ar merdeer-mañ.
pdfjs-printing-not-ready = Kemenn: N'hall ket bezañ moullet ar restr PDF rak n'eo ket karget penn-da-benn.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Diskouez/kuzhat ar varrenn gostez
pdfjs-toggle-sidebar-notification-button =
    .title = Trec'haoliñ ar varrenn-gostez (ur steuñv pe stagadennoù a zo en teul)
pdfjs-toggle-sidebar-button-label = Diskouez/kuzhat ar varrenn gostez
pdfjs-document-outline-button =
    .title = Diskouez steuñv an teul (daouglikit evit brasaat/bihanaat an holl elfennoù)
pdfjs-document-outline-button-label = Sinedoù an teuliad
pdfjs-attachments-button =
    .title = Diskouez ar c'henstagadurioù
pdfjs-attachments-button-label = Kenstagadurioù
pdfjs-layers-button =
    .title = Diskouez ar gwiskadoù (daou-glikañ evit adderaouekaat an holl gwiskadoù d'o stad dre ziouer)
pdfjs-layers-button-label = Gwiskadoù
pdfjs-thumbs-button =
    .title = Diskouez ar melvennoù
pdfjs-thumbs-button-label = Melvennoù
pdfjs-findbar-button =
    .title = Klask e-barzh an teuliad
pdfjs-findbar-button-label = Klask
pdfjs-additional-layers = Gwiskadoù ouzhpenn

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pajenn { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Melvenn ar bajenn { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Klask
    .placeholder = Klask e-barzh an teuliad
pdfjs-find-previous-button =
    .title = Kavout an tamm frazenn kent o klotañ ganti
pdfjs-find-previous-button-label = Kent
pdfjs-find-next-button =
    .title = Kavout an tamm frazenn war-lerc'h o klotañ ganti
pdfjs-find-next-button-label = War-lerc'h
pdfjs-find-highlight-checkbox = Usskediñ pep tra
pdfjs-find-match-case-checkbox-label = Teurel evezh ouzh ar pennlizherennoù
pdfjs-find-entire-word-checkbox-label = Gerioù a-bezh
pdfjs-find-reached-top = Tizhet eo bet derou ar bajenn, kenderc'hel diouzh an diaz
pdfjs-find-reached-bottom = Tizhet eo bet dibenn ar bajenn, kenderc'hel diouzh ar c'hrec'h
pdfjs-find-not-found = N'haller ket kavout ar frazenn

## Predefined zoom values

pdfjs-page-scale-width = Led ar bajenn
pdfjs-page-scale-fit = Pajenn a-bezh
pdfjs-page-scale-auto = Zoum emgefreek
pdfjs-page-scale-actual = Ment wir
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Pajenn { $page }

## Loading indicator messages

pdfjs-loading-error = Degouezhet ez eus bet ur fazi e-pad kargañ ar PDF.
pdfjs-invalid-file-error = Restr PDF didalvoudek pe kontronet.
pdfjs-missing-file-error = Restr PDF o vankout.
pdfjs-unexpected-response-error = Respont dic'hortoz a-berzh an dafariad
pdfjs-rendering-error = Degouezhet ez eus bet ur fazi e-pad skrammañ ar bajennad.

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
    .alt = [{ $type } Notennañ]

## Password

pdfjs-password-label = Enankit ar ger-tremen evit digeriñ ar restr PDF-mañ.
pdfjs-password-invalid = Ger-tremen didalvoudek. Klaskit en-dro mar plij.
pdfjs-password-ok-button = Mat eo
pdfjs-password-cancel-button = Nullañ
pdfjs-web-fonts-disabled = Diweredekaet eo an nodrezhoù web: n'haller ket arverañ an nodrezhoù PDF enframmet.

## Editing

pdfjs-editor-free-text-button =
    .title = Testenn
pdfjs-editor-free-text-button-label = Testenn
pdfjs-editor-ink-button =
    .title = Tresañ
pdfjs-editor-ink-button-label = Tresañ
pdfjs-editor-stamp-button =
    .title = Ouzhpennañ pe aozañ skeudennoù
pdfjs-editor-stamp-button-label = Ouzhpennañ pe aozañ skeudennoù

## Remove button for the various kind of editor.


##

# Editor Parameters
pdfjs-editor-free-text-color-input = Liv
pdfjs-editor-free-text-size-input = Ment
pdfjs-editor-ink-color-input = Liv
pdfjs-editor-ink-thickness-input = Tevder
pdfjs-editor-ink-opacity-input = Boullder
pdfjs-editor-stamp-add-image-button =
    .title = Ouzhpennañ ur skeudenn
pdfjs-editor-stamp-add-image-button-label = Ouzhpennañ ur skeudenn
pdfjs-free-text =
    .aria-label = Aozer testennoù
pdfjs-ink =
    .aria-label = Aozer tresoù
pdfjs-ink-canvas =
    .aria-label = Skeudenn bet krouet gant an implijer·ez

## Alt-text dialog

pdfjs-editor-alt-text-add-description-label = Ouzhpennañ un deskrivadur
pdfjs-editor-alt-text-cancel-button = Nullañ
pdfjs-editor-alt-text-save-button = Enrollañ

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.


## Color picker

