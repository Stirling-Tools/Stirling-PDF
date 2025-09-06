# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = წინა გვერდი
pdfjs-previous-button-label = წინა
pdfjs-next-button =
    .title = შემდეგი გვერდი
pdfjs-next-button-label = შემდეგი
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = გვერდი
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount }-დან
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } { $pagesCount }-დან)
pdfjs-zoom-out-button =
    .title = ზომის შემცირება
pdfjs-zoom-out-button-label = დაშორება
pdfjs-zoom-in-button =
    .title = ზომის გაზრდა
pdfjs-zoom-in-button-label = მოახლოება
pdfjs-zoom-select =
    .title = ზომა
pdfjs-presentation-mode-button =
    .title = ჩვენების რეჟიმზე გადართვა
pdfjs-presentation-mode-button-label = ჩვენების რეჟიმი
pdfjs-open-file-button =
    .title = ფაილის გახსნა
pdfjs-open-file-button-label = გახსნა
pdfjs-print-button =
    .title = ამობეჭდვა
pdfjs-print-button-label = ამობეჭდვა
pdfjs-save-button =
    .title = შენახვა
pdfjs-save-button-label = შენახვა
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = ჩამოტვირთვა
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = ჩამოტვირთვა
pdfjs-bookmark-button =
    .title = მიმდინარე გვერდი (ბმული ამ გვერდისთვის)
pdfjs-bookmark-button-label = მიმდინარე გვერდი
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = გახსნა პროგრამით
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = გახსნა პროგრამით

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = ხელსაწყოები
pdfjs-tools-button-label = ხელსაწყოები
pdfjs-first-page-button =
    .title = პირველ გვერდზე გადასვლა
pdfjs-first-page-button-label = პირველ გვერდზე გადასვლა
pdfjs-last-page-button =
    .title = ბოლო გვერდზე გადასვლა
pdfjs-last-page-button-label = ბოლო გვერდზე გადასვლა
pdfjs-page-rotate-cw-button =
    .title = საათის ისრის მიმართულებით შებრუნება
pdfjs-page-rotate-cw-button-label = მარჯვნივ გადაბრუნება
pdfjs-page-rotate-ccw-button =
    .title = საათის ისრის საპირისპიროდ შებრუნება
pdfjs-page-rotate-ccw-button-label = მარცხნივ გადაბრუნება
pdfjs-cursor-text-select-tool-button =
    .title = მოსანიშნი მაჩვენებლის გამოყენება
pdfjs-cursor-text-select-tool-button-label = მოსანიშნი მაჩვენებელი
pdfjs-cursor-hand-tool-button =
    .title = გადასაადგილებელი მაჩვენებლის გამოყენება
pdfjs-cursor-hand-tool-button-label = გადასაადგილებელი
pdfjs-scroll-page-button =
    .title = გვერდზე გადაადგილების გამოყენება
pdfjs-scroll-page-button-label = გვერდშივე გადაადგილება
pdfjs-scroll-vertical-button =
    .title = გვერდების შვეულად ჩვენება
pdfjs-scroll-vertical-button-label = შვეული გადაადგილება
pdfjs-scroll-horizontal-button =
    .title = გვერდების თარაზულად ჩვენება
pdfjs-scroll-horizontal-button-label = განივი გადაადგილება
pdfjs-scroll-wrapped-button =
    .title = გვერდების ცხრილურად ჩვენება
pdfjs-scroll-wrapped-button-label = ცხრილური გადაადგილება
pdfjs-spread-none-button =
    .title = ორ გვერდზე გაშლის გარეშე
pdfjs-spread-none-button-label = ცალგვერდიანი ჩვენება
pdfjs-spread-odd-button =
    .title = ორ გვერდზე გაშლა კენტი გვერდიდან
pdfjs-spread-odd-button-label = ორ გვერდზე კენტიდან
pdfjs-spread-even-button =
    .title = ორ გვერდზე გაშლა ლუწი გვერდიდან
pdfjs-spread-even-button-label = ორ გვერდზე ლუწიდან

## Document properties dialog

pdfjs-document-properties-button =
    .title = დოკუმენტის შესახებ…
pdfjs-document-properties-button-label = დოკუმენტის შესახებ…
pdfjs-document-properties-file-name = ფაილის სახელი:
pdfjs-document-properties-file-size = ფაილის მოცულობა:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } კბ ({ $size_b } ბაიტი)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } მბ ({ $size_b } ბაიტი)
pdfjs-document-properties-title = სათაური:
pdfjs-document-properties-author = შემქმნელი:
pdfjs-document-properties-subject = თემა:
pdfjs-document-properties-keywords = საკვანძო სიტყვები:
pdfjs-document-properties-creation-date = შექმნის დრო:
pdfjs-document-properties-modification-date = ჩასწორების დრო:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = შემდგენელი:
pdfjs-document-properties-producer = PDF-შემდგენელი:
pdfjs-document-properties-version = PDF-ვერსია:
pdfjs-document-properties-page-count = გვერდები:
pdfjs-document-properties-page-size = გვერდის ზომა:
pdfjs-document-properties-page-size-unit-inches = დუიმი
pdfjs-document-properties-page-size-unit-millimeters = მმ
pdfjs-document-properties-page-size-orientation-portrait = შვეულად
pdfjs-document-properties-page-size-orientation-landscape = თარაზულად
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
pdfjs-document-properties-linearized = მსუბუქი ვებჩვენება:
pdfjs-document-properties-linearized-yes = დიახ
pdfjs-document-properties-linearized-no = არა
pdfjs-document-properties-close-button = დახურვა

## Print

pdfjs-print-progress-message = დოკუმენტი მზადდება ამოსაბეჭდად…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = გაუქმება
pdfjs-printing-not-supported = გაფრთხილება: ამობეჭდვა ამ ბრაუზერში არაა სრულად მხარდაჭერილი.
pdfjs-printing-not-ready = გაფრთხილება: PDF სრულად ჩატვირთული არაა, ამობეჭდვის დასაწყებად.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = გვერდითა ზოლის გამოჩენა/დამალვა
pdfjs-toggle-sidebar-notification-button =
    .title = გვერდითი ზოლის გამოჩენა (შეიცავს სარჩევს/დანართს/ფენებს)
pdfjs-toggle-sidebar-button-label = გვერდითა ზოლის გამოჩენა/დამალვა
pdfjs-document-outline-button =
    .title = დოკუმენტის სარჩევის ჩვენება (ორმაგი წკაპით თითოეულის ჩამოშლა/აკეცვა)
pdfjs-document-outline-button-label = დოკუმენტის სარჩევი
pdfjs-attachments-button =
    .title = დანართების ჩვენება
pdfjs-attachments-button-label = დანართები
pdfjs-layers-button =
    .title = ფენების გამოჩენა (ორმაგი წკაპით ყველა ფენის ნაგულისხმევზე დაბრუნება)
pdfjs-layers-button-label = ფენები
pdfjs-thumbs-button =
    .title = შეთვალიერება
pdfjs-thumbs-button-label = ესკიზები
pdfjs-current-outline-item-button =
    .title = მიმდინარე გვერდის მონახვა სარჩევში
pdfjs-current-outline-item-button-label = მიმდინარე გვერდი სარჩევში
pdfjs-findbar-button =
    .title = პოვნა დოკუმენტში
pdfjs-findbar-button-label = ძიება
pdfjs-additional-layers = დამატებითი ფენები

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = გვერდი { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = გვერდის შეთვალიერება { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = ძიება
    .placeholder = პოვნა დოკუმენტში…
pdfjs-find-previous-button =
    .title = ფრაზის წინა კონტექსტის პოვნა
pdfjs-find-previous-button-label = წინა
pdfjs-find-next-button =
    .title = ფრაზის შემდეგი კონტექსტის პოვნა
pdfjs-find-next-button-label = შემდეგი
pdfjs-find-highlight-checkbox = ყველაფრის მონიშვნა
pdfjs-find-match-case-checkbox-label = მთავრულით
pdfjs-find-match-diacritics-checkbox-label = ნიშნებით
pdfjs-find-entire-word-checkbox-label = მთლიანი სიტყვები
pdfjs-find-reached-top = მიღწეულია დოკუმენტის დასაწყისი, გრძელდება ბოლოდან
pdfjs-find-reached-bottom = მიღწეულია დოკუმენტის ბოლო, გრძელდება დასაწყისიდან
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] თანხვედრა { $current }, სულ { $total }
       *[other] თანხვედრა { $current }, სულ { $total }
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] არანაკლებ { $limit } თანხვედრა
       *[other] არანაკლებ { $limit } თანხვედრა
    }
pdfjs-find-not-found = ფრაზა ვერ მოიძებნა

## Predefined zoom values

pdfjs-page-scale-width = გვერდის სიგანეზე
pdfjs-page-scale-fit = მთლიანი გვერდი
pdfjs-page-scale-auto = ავტომატური
pdfjs-page-scale-actual = საწყისი ზომა
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = გვერდი { $page }

## Loading indicator messages

pdfjs-loading-error = შეცდომა, PDF-ფაილის ჩატვირთვისას.
pdfjs-invalid-file-error = არამართებული ან დაზიანებული PDF-ფაილი.
pdfjs-missing-file-error = ნაკლული PDF-ფაილი.
pdfjs-unexpected-response-error = სერვერის მოულოდნელი პასუხი.
pdfjs-rendering-error = შეცდომა, გვერდის ჩვენებისას.

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
    .alt = [{ $type } შენიშვნა]

## Password

pdfjs-password-label = შეიყვანეთ პაროლი PDF-ფაილის გასახსნელად.
pdfjs-password-invalid = არასწორი პაროლი. გთხოვთ, სცადოთ ხელახლა.
pdfjs-password-ok-button = კარგი
pdfjs-password-cancel-button = გაუქმება
pdfjs-web-fonts-disabled = ვებშრიფტები გამორთულია: ჩაშენებული PDF-შრიფტების გამოყენება ვერ ხერხდება.

## Editing

pdfjs-editor-free-text-button =
    .title = წარწერა
pdfjs-editor-free-text-button-label = ტექსტი
pdfjs-editor-ink-button =
    .title = ხაზვა
pdfjs-editor-ink-button-label = ხაზვა
pdfjs-editor-stamp-button =
    .title = სურათების დართვა ან ჩასწორება
pdfjs-editor-stamp-button-label = სურათების დართვა ან ჩასწორება
pdfjs-editor-remove-button =
    .title = მოცილება
pdfjs-editor-highlight-button =
    .title = მონიშვნა
pdfjs-editor-highlight-button-label = მონიშვნა

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = დახაზულის მოცილება
pdfjs-editor-remove-freetext-button =
    .title = წარწერის მოცილება
pdfjs-editor-remove-stamp-button =
    .title = სურათის მოცილება
pdfjs-editor-remove-highlight-button =
    .title = მონიშვნის მოცილება

##

# Editor Parameters
pdfjs-editor-free-text-color-input = ფერი
pdfjs-editor-free-text-size-input = ზომა
pdfjs-editor-ink-color-input = ფერი
pdfjs-editor-ink-thickness-input = სისქე
pdfjs-editor-ink-opacity-input = გაუმჭვირვალობა
pdfjs-editor-stamp-add-image-button =
    .title = სურათის დამატება
pdfjs-editor-stamp-add-image-button-label = სურათის დამატება
pdfjs-free-text =
    .aria-label = ნაწერის ჩასწორება
pdfjs-free-text-default-content = აკრიფეთ…
pdfjs-ink =
    .aria-label = დახაზულის შესწორება
pdfjs-ink-canvas =
    .aria-label = მომხმარებლის შექმნილი სურათი

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = თანდართული წარწერა
pdfjs-editor-alt-text-edit-button-label = თანდართული წარწერის ჩასწორება
pdfjs-editor-alt-text-dialog-label = არჩევა
pdfjs-editor-alt-text-dialog-description = თანდართული (შემნაცვლებელი) წარწერა გამოსადეგია მათთვის, ვინც ვერ ხედავს სურათებს ან გამოისახება მაშინ, როცა სურათი ვერ ჩაიტვირთება.
pdfjs-editor-alt-text-add-description-label = აღწერილობის მითითება
pdfjs-editor-alt-text-add-description-description = განკუთვნილია 1-2 წინადადებით საგნის, მახასიათებლის ან მოქმედების აღსაწერად.
pdfjs-editor-alt-text-mark-decorative-label = მოინიშნოს მორთულობად
pdfjs-editor-alt-text-mark-decorative-description = განკუთვნილია შესამკობი სურათებისთვის, გარსშემოსავლები ჩარჩოებისა და ჭვირნიშნებისთვის.
pdfjs-editor-alt-text-cancel-button = გაუქმება
pdfjs-editor-alt-text-save-button = შენახვა
pdfjs-editor-alt-text-decorative-tooltip = მოინიშნოს მორთულობად
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = მაგალითად, „ახალგაზრდა მამაკაცი მაგიდასთან ზის და სადილობს“

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = ზევით მარცხნივ — ზომაცვლა
pdfjs-editor-resizer-label-top-middle = ზევით შუაში — ზომაცვლა
pdfjs-editor-resizer-label-top-right = ზევით მარჯვნივ — ზომაცვლა
pdfjs-editor-resizer-label-middle-right = შუაში მარჯვნივ — ზომაცვლა
pdfjs-editor-resizer-label-bottom-right = ქვევით მარჯვნივ — ზომაცვლა
pdfjs-editor-resizer-label-bottom-middle = ქვევით შუაში — ზომაცვლა
pdfjs-editor-resizer-label-bottom-left = ზვევით მარცხნივ — ზომაცვლა
pdfjs-editor-resizer-label-middle-left = შუაში მარცხნივ — ზომაცვლა

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = მოსანიშნი ფერი
pdfjs-editor-colorpicker-button =
    .title = ფერის შეცვლა
pdfjs-editor-colorpicker-dropdown =
    .aria-label = ფერის არჩევა
pdfjs-editor-colorpicker-yellow =
    .title = ყვითელი
pdfjs-editor-colorpicker-green =
    .title = მწვანე
pdfjs-editor-colorpicker-blue =
    .title = ლურჯი
pdfjs-editor-colorpicker-pink =
    .title = ვარდისფერი
pdfjs-editor-colorpicker-red =
    .title = წითელი
