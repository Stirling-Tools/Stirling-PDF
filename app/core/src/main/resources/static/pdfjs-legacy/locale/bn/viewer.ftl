# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = পূর্ববর্তী পাতা
pdfjs-previous-button-label = পূর্ববর্তী
pdfjs-next-button =
    .title = পরবর্তী পাতা
pdfjs-next-button-label = পরবর্তী
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = পাতা
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } এর
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pagesCount } এর { $pageNumber })
pdfjs-zoom-out-button =
    .title = ছোট আকারে প্রদর্শন
pdfjs-zoom-out-button-label = ছোট আকারে প্রদর্শন
pdfjs-zoom-in-button =
    .title = বড় আকারে প্রদর্শন
pdfjs-zoom-in-button-label = বড় আকারে প্রদর্শন
pdfjs-zoom-select =
    .title = বড় আকারে প্রদর্শন
pdfjs-presentation-mode-button =
    .title = উপস্থাপনা মোডে স্যুইচ করুন
pdfjs-presentation-mode-button-label = উপস্থাপনা মোড
pdfjs-open-file-button =
    .title = ফাইল খুলুন
pdfjs-open-file-button-label = খুলুন
pdfjs-print-button =
    .title = মুদ্রণ
pdfjs-print-button-label = মুদ্রণ

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = টুল
pdfjs-tools-button-label = টুল
pdfjs-first-page-button =
    .title = প্রথম পাতায় যাও
pdfjs-first-page-button-label = প্রথম পাতায় যাও
pdfjs-last-page-button =
    .title = শেষ পাতায় যাও
pdfjs-last-page-button-label = শেষ পাতায় যাও
pdfjs-page-rotate-cw-button =
    .title = ঘড়ির কাঁটার দিকে ঘোরাও
pdfjs-page-rotate-cw-button-label = ঘড়ির কাঁটার দিকে ঘোরাও
pdfjs-page-rotate-ccw-button =
    .title = ঘড়ির কাঁটার বিপরীতে ঘোরাও
pdfjs-page-rotate-ccw-button-label = ঘড়ির কাঁটার বিপরীতে ঘোরাও
pdfjs-cursor-text-select-tool-button =
    .title = লেখা নির্বাচক টুল সক্রিয় করুন
pdfjs-cursor-text-select-tool-button-label = লেখা নির্বাচক টুল
pdfjs-cursor-hand-tool-button =
    .title = হ্যান্ড টুল সক্রিয় করুন
pdfjs-cursor-hand-tool-button-label = হ্যান্ড টুল
pdfjs-scroll-vertical-button =
    .title = উলম্ব স্ক্রলিং ব্যবহার করুন
pdfjs-scroll-vertical-button-label = উলম্ব স্ক্রলিং
pdfjs-scroll-horizontal-button =
    .title = অনুভূমিক স্ক্রলিং ব্যবহার করুন
pdfjs-scroll-horizontal-button-label = অনুভূমিক স্ক্রলিং
pdfjs-scroll-wrapped-button =
    .title = Wrapped স্ক্রোলিং ব্যবহার করুন
pdfjs-scroll-wrapped-button-label = Wrapped স্ক্রোলিং
pdfjs-spread-none-button =
    .title = পেজ স্প্রেডগুলোতে যোগদান করবেন না
pdfjs-spread-none-button-label = Spreads নেই
pdfjs-spread-odd-button-label = বিজোড় Spreads
pdfjs-spread-even-button-label = জোড় Spreads

## Document properties dialog

pdfjs-document-properties-button =
    .title = নথি বৈশিষ্ট্য…
pdfjs-document-properties-button-label = নথি বৈশিষ্ট্য…
pdfjs-document-properties-file-name = ফাইলের নাম:
pdfjs-document-properties-file-size = ফাইলের আকার:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } কেবি ({ $size_b } বাইট)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } এমবি ({ $size_b } বাইট)
pdfjs-document-properties-title = শিরোনাম:
pdfjs-document-properties-author = লেখক:
pdfjs-document-properties-subject = বিষয়:
pdfjs-document-properties-keywords = কীওয়ার্ড:
pdfjs-document-properties-creation-date = তৈরির তারিখ:
pdfjs-document-properties-modification-date = পরিবর্তনের তারিখ:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = প্রস্তুতকারক:
pdfjs-document-properties-producer = পিডিএফ প্রস্তুতকারক:
pdfjs-document-properties-version = পিডিএফ সংষ্করণ:
pdfjs-document-properties-page-count = মোট পাতা:
pdfjs-document-properties-page-size = পাতার সাইজ:
pdfjs-document-properties-page-size-unit-inches = এর মধ্যে
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = উলম্ব
pdfjs-document-properties-page-size-orientation-landscape = অনুভূমিক
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = লেটার
pdfjs-document-properties-page-size-name-legal = লীগাল

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
pdfjs-document-properties-linearized = Fast Web View:
pdfjs-document-properties-linearized-yes = হ্যাঁ
pdfjs-document-properties-linearized-no = না
pdfjs-document-properties-close-button = বন্ধ

## Print

pdfjs-print-progress-message = মুদ্রণের জন্য নথি প্রস্তুত করা হচ্ছে…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = বাতিল
pdfjs-printing-not-supported = সতর্কতা: এই ব্রাউজারে মুদ্রণ সম্পূর্ণভাবে সমর্থিত নয়।
pdfjs-printing-not-ready = সতর্কীকরণ: পিডিএফটি মুদ্রণের জন্য সম্পূর্ণ লোড হয়নি।

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = সাইডবার টগল করুন
pdfjs-toggle-sidebar-button-label = সাইডবার টগল করুন
pdfjs-document-outline-button =
    .title = নথির আউটলাইন দেখাও (সব আইটেম প্রসারিত/সঙ্কুচিত করতে ডবল ক্লিক করুন)
pdfjs-document-outline-button-label = নথির রূপরেখা
pdfjs-attachments-button =
    .title = সংযুক্তি দেখাও
pdfjs-attachments-button-label = সংযুক্তি
pdfjs-thumbs-button =
    .title = থাম্বনেইল সমূহ প্রদর্শন করুন
pdfjs-thumbs-button-label = থাম্বনেইল সমূহ
pdfjs-findbar-button =
    .title = নথির মধ্যে খুঁজুন
pdfjs-findbar-button-label = খুঁজুন

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = পাতা { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page } পাতার থাম্বনেইল

## Find panel button title and messages

pdfjs-find-input =
    .title = খুঁজুন
    .placeholder = নথির মধ্যে খুঁজুন…
pdfjs-find-previous-button =
    .title = বাক্যাংশের পূর্ববর্তী উপস্থিতি অনুসন্ধান
pdfjs-find-previous-button-label = পূর্ববর্তী
pdfjs-find-next-button =
    .title = বাক্যাংশের পরবর্তী উপস্থিতি অনুসন্ধান
pdfjs-find-next-button-label = পরবর্তী
pdfjs-find-highlight-checkbox = সব হাইলাইট করুন
pdfjs-find-match-case-checkbox-label = অক্ষরের ছাঁদ মেলানো
pdfjs-find-entire-word-checkbox-label = সম্পূর্ণ শব্দ
pdfjs-find-reached-top = পাতার শুরুতে পৌছে গেছে, নীচ থেকে আরম্ভ করা হয়েছে
pdfjs-find-reached-bottom = পাতার শেষে পৌছে গেছে, উপর থেকে আরম্ভ করা হয়েছে
pdfjs-find-not-found = বাক্যাংশ পাওয়া যায়নি

## Predefined zoom values

pdfjs-page-scale-width = পাতার প্রস্থ
pdfjs-page-scale-fit = পাতা ফিট করুন
pdfjs-page-scale-auto = স্বয়ংক্রিয় জুম
pdfjs-page-scale-actual = প্রকৃত আকার
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = পিডিএফ লোড করার সময় ত্রুটি দেখা দিয়েছে।
pdfjs-invalid-file-error = অকার্যকর অথবা ক্ষতিগ্রস্ত পিডিএফ ফাইল।
pdfjs-missing-file-error = নিখোঁজ PDF ফাইল।
pdfjs-unexpected-response-error = অপ্রত্যাশীত সার্ভার প্রতিক্রিয়া।
pdfjs-rendering-error = পাতা উপস্থাপনার সময় ত্রুটি দেখা দিয়েছে।

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
    .alt = [{ $type } টীকা]

## Password

pdfjs-password-label = পিডিএফ ফাইলটি ওপেন করতে পাসওয়ার্ড দিন।
pdfjs-password-invalid = ভুল পাসওয়ার্ড। অনুগ্রহ করে আবার চেষ্টা করুন।
pdfjs-password-ok-button = ঠিক আছে
pdfjs-password-cancel-button = বাতিল
pdfjs-web-fonts-disabled = ওয়েব ফন্ট নিষ্ক্রিয়: সংযুক্ত পিডিএফ ফন্ট ব্যবহার করা যাচ্ছে না।

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

