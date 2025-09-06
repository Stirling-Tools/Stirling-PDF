# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = အရင် စာမျက်နှာ
pdfjs-previous-button-label = အရင်နေရာ
pdfjs-next-button =
    .title = ရှေ့ စာမျက်နှာ
pdfjs-next-button-label = နောက်တခု
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = စာမျက်နှာ
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = { $pagesCount } ၏
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pagesCount } ၏ { $pageNumber })
pdfjs-zoom-out-button =
    .title = ချုံ့ပါ
pdfjs-zoom-out-button-label = ချုံ့ပါ
pdfjs-zoom-in-button =
    .title = ချဲ့ပါ
pdfjs-zoom-in-button-label = ချဲ့ပါ
pdfjs-zoom-select =
    .title = ချုံ့/ချဲ့ပါ
pdfjs-presentation-mode-button =
    .title = ဆွေးနွေးတင်ပြစနစ်သို့ ကူးပြောင်းပါ
pdfjs-presentation-mode-button-label = ဆွေးနွေးတင်ပြစနစ်
pdfjs-open-file-button =
    .title = ဖိုင်အားဖွင့်ပါ။
pdfjs-open-file-button-label = ဖွင့်ပါ
pdfjs-print-button =
    .title = ပုံနှိုပ်ပါ
pdfjs-print-button-label = ပုံနှိုပ်ပါ

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = ကိရိယာများ
pdfjs-tools-button-label = ကိရိယာများ
pdfjs-first-page-button =
    .title = ပထမ စာမျက်နှာသို့
pdfjs-first-page-button-label = ပထမ စာမျက်နှာသို့
pdfjs-last-page-button =
    .title = နောက်ဆုံး စာမျက်နှာသို့
pdfjs-last-page-button-label = နောက်ဆုံး စာမျက်နှာသို့
pdfjs-page-rotate-cw-button =
    .title = နာရီလက်တံ အတိုင်း
pdfjs-page-rotate-cw-button-label = နာရီလက်တံ အတိုင်း
pdfjs-page-rotate-ccw-button =
    .title = နာရီလက်တံ ပြောင်းပြန်
pdfjs-page-rotate-ccw-button-label = နာရီလက်တံ ပြောင်းပြန်

## Document properties dialog

pdfjs-document-properties-button =
    .title = မှတ်တမ်းမှတ်ရာ ဂုဏ်သတ္တိများ
pdfjs-document-properties-button-label = မှတ်တမ်းမှတ်ရာ ဂုဏ်သတ္တိများ
pdfjs-document-properties-file-name = ဖိုင် :
pdfjs-document-properties-file-size = ဖိုင်ဆိုဒ် :
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } ကီလိုဘိုတ် ({ $size_b }ဘိုတ်)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = ခေါင်းစဉ်‌ -
pdfjs-document-properties-author = ရေးသားသူ:
pdfjs-document-properties-subject = အကြောင်းအရာ:
pdfjs-document-properties-keywords = သော့ချက် စာလုံး:
pdfjs-document-properties-creation-date = ထုတ်လုပ်ရက်စွဲ:
pdfjs-document-properties-modification-date = ပြင်ဆင်ရက်စွဲ:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = ဖန်တီးသူ:
pdfjs-document-properties-producer = PDF ထုတ်လုပ်သူ:
pdfjs-document-properties-version = PDF ဗားရှင်း:
pdfjs-document-properties-page-count = စာမျက်နှာအရေအတွက်:

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page


##

pdfjs-document-properties-close-button = ပိတ်

## Print

pdfjs-print-progress-message = Preparing document for printing…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = ပယ်​ဖျက်ပါ
pdfjs-printing-not-supported = သတိပေးချက်၊ပရင့်ထုတ်ခြင်းကိုဤဘယောက်ဆာသည် ပြည့်ဝစွာထောက်ပံ့မထားပါ ။
pdfjs-printing-not-ready = သတိပေးချက်: ယခု PDF ဖိုင်သည် ပုံနှိပ်ရန် မပြည့်စုံပါ

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = ဘေးတန်းဖွင့်ပိတ်
pdfjs-toggle-sidebar-button-label = ဖွင့်ပိတ် ဆလိုက်ဒါ
pdfjs-document-outline-button =
    .title = စာတမ်းအကျဉ်းချုပ်ကို ပြပါ (စာရင်းအားလုံးကို ချုံ့/ချဲ့ရန် ကလစ်နှစ်ချက်နှိပ်ပါ)
pdfjs-document-outline-button-label = စာတမ်းအကျဉ်းချုပ်
pdfjs-attachments-button =
    .title = တွဲချက်များ ပြပါ
pdfjs-attachments-button-label = တွဲထားချက်များ
pdfjs-thumbs-button =
    .title = ပုံရိပ်ငယ်များကို ပြပါ
pdfjs-thumbs-button-label = ပုံရိပ်ငယ်များ
pdfjs-findbar-button =
    .title = Find in Document
pdfjs-findbar-button-label = ရှာဖွေပါ

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = စာမျက်နှာ { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = စာမျက်နှာရဲ့ ပုံရိပ်ငယ် { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = ရှာဖွေပါ
    .placeholder = စာတမ်းထဲတွင် ရှာဖွေရန်…
pdfjs-find-previous-button =
    .title = စကားစုရဲ့ အရင် ​ဖြစ်ပွားမှုကို ရှာဖွေပါ
pdfjs-find-previous-button-label = နောက်သို့
pdfjs-find-next-button =
    .title = စကားစုရဲ့ နောက်ထပ် ​ဖြစ်ပွားမှုကို ရှာဖွေပါ
pdfjs-find-next-button-label = ရှေ့သို့
pdfjs-find-highlight-checkbox = အားလုံးကို မျဉ်းသားပါ
pdfjs-find-match-case-checkbox-label = စာလုံး တိုက်ဆိုင်ပါ
pdfjs-find-reached-top = စာမျက်နှာထိပ် ရောက်နေပြီ၊ အဆုံးကနေ ပြန်စပါ
pdfjs-find-reached-bottom = စာမျက်နှာအဆုံး ရောက်နေပြီ၊ ထိပ်ကနေ ပြန်စပါ
pdfjs-find-not-found = စကားစု မတွေ့ရဘူး

## Predefined zoom values

pdfjs-page-scale-width = စာမျက်နှာ အကျယ်
pdfjs-page-scale-fit = စာမျက်နှာ ကွက်တိ
pdfjs-page-scale-auto = အလိုအလျောက် ချုံ့ချဲ့
pdfjs-page-scale-actual = အမှန်တကယ်ရှိတဲ့ အရွယ်
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page


## Loading indicator messages

pdfjs-loading-error = PDF ဖိုင် ကိုဆွဲတင်နေချိန်မှာ အမှားတစ်ခုတွေ့ရပါတယ်။
pdfjs-invalid-file-error = မရသော သို့ ပျက်နေသော PDF ဖိုင်
pdfjs-missing-file-error = PDF ပျောက်ဆုံး
pdfjs-unexpected-response-error = မမျှော်လင့်ထားသော ဆာဗာမှ ပြန်ကြားချက်
pdfjs-rendering-error = စာမျက်နှာကို ပုံဖော်နေချိန်မှာ အမှားတစ်ခုတွေ့ရပါတယ်။

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } အဓိပ္ပာယ်ဖွင့်ဆိုချက်]

## Password

pdfjs-password-label = ယခု PDF ကို ဖွင့်ရန် စကားဝှက်ကို ရိုက်ပါ။
pdfjs-password-invalid = စာဝှက် မှားသည်။ ထပ်ကြိုးစားကြည့်ပါ။
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = ပယ်​ဖျက်ပါ
pdfjs-web-fonts-disabled = Web fonts are disabled: unable to use embedded PDF fonts.

## Editing


## Alt-text dialog


## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

