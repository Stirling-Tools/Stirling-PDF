# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Προηγούμενη σελίδα
pdfjs-previous-button-label = Προηγούμενη
pdfjs-next-button =
    .title = Επόμενη σελίδα
pdfjs-next-button-label = Επόμενη
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Σελίδα
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = από { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } από { $pagesCount })
pdfjs-zoom-out-button =
    .title = Σμίκρυνση
pdfjs-zoom-out-button-label = Σμίκρυνση
pdfjs-zoom-in-button =
    .title = Μεγέθυνση
pdfjs-zoom-in-button-label = Μεγέθυνση
pdfjs-zoom-select =
    .title = Ζουμ
pdfjs-presentation-mode-button =
    .title = Εναλλαγή σε λειτουργία παρουσίασης
pdfjs-presentation-mode-button-label = Λειτουργία παρουσίασης
pdfjs-open-file-button =
    .title = Άνοιγμα αρχείου
pdfjs-open-file-button-label = Άνοιγμα
pdfjs-print-button =
    .title = Εκτύπωση
pdfjs-print-button-label = Εκτύπωση
pdfjs-save-button =
    .title = Αποθήκευση
pdfjs-save-button-label = Αποθήκευση
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Λήψη
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Λήψη
pdfjs-bookmark-button =
    .title = Τρέχουσα σελίδα (Προβολή URL από τρέχουσα σελίδα)
pdfjs-bookmark-button-label = Τρέχουσα σελίδα
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Άνοιγμα σε εφαρμογή
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Άνοιγμα σε εφαρμογή

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Εργαλεία
pdfjs-tools-button-label = Εργαλεία
pdfjs-first-page-button =
    .title = Μετάβαση στην πρώτη σελίδα
pdfjs-first-page-button-label = Μετάβαση στην πρώτη σελίδα
pdfjs-last-page-button =
    .title = Μετάβαση στην τελευταία σελίδα
pdfjs-last-page-button-label = Μετάβαση στην τελευταία σελίδα
pdfjs-page-rotate-cw-button =
    .title = Δεξιόστροφη περιστροφή
pdfjs-page-rotate-cw-button-label = Δεξιόστροφη περιστροφή
pdfjs-page-rotate-ccw-button =
    .title = Αριστερόστροφη περιστροφή
pdfjs-page-rotate-ccw-button-label = Αριστερόστροφη περιστροφή
pdfjs-cursor-text-select-tool-button =
    .title = Ενεργοποίηση εργαλείου επιλογής κειμένου
pdfjs-cursor-text-select-tool-button-label = Εργαλείο επιλογής κειμένου
pdfjs-cursor-hand-tool-button =
    .title = Ενεργοποίηση εργαλείου χεριού
pdfjs-cursor-hand-tool-button-label = Εργαλείο χεριού
pdfjs-scroll-page-button =
    .title = Χρήση κύλισης σελίδας
pdfjs-scroll-page-button-label = Κύλιση σελίδας
pdfjs-scroll-vertical-button =
    .title = Χρήση κάθετης κύλισης
pdfjs-scroll-vertical-button-label = Κάθετη κύλιση
pdfjs-scroll-horizontal-button =
    .title = Χρήση οριζόντιας κύλισης
pdfjs-scroll-horizontal-button-label = Οριζόντια κύλιση
pdfjs-scroll-wrapped-button =
    .title = Χρήση κυκλικής κύλισης
pdfjs-scroll-wrapped-button-label = Κυκλική κύλιση
pdfjs-spread-none-button =
    .title = Να μη γίνει σύνδεση επεκτάσεων σελίδων
pdfjs-spread-none-button-label = Χωρίς επεκτάσεις
pdfjs-spread-odd-button =
    .title = Σύνδεση επεκτάσεων σελίδων ξεκινώντας από τις μονές σελίδες
pdfjs-spread-odd-button-label = Μονές επεκτάσεις
pdfjs-spread-even-button =
    .title = Σύνδεση επεκτάσεων σελίδων ξεκινώντας από τις ζυγές σελίδες
pdfjs-spread-even-button-label = Ζυγές επεκτάσεις

## Document properties dialog

pdfjs-document-properties-button =
    .title = Ιδιότητες εγγράφου…
pdfjs-document-properties-button-label = Ιδιότητες εγγράφου…
pdfjs-document-properties-file-name = Όνομα αρχείου:
pdfjs-document-properties-file-size = Μέγεθος αρχείου:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bytes)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bytes)
pdfjs-document-properties-title = Τίτλος:
pdfjs-document-properties-author = Συγγραφέας:
pdfjs-document-properties-subject = Θέμα:
pdfjs-document-properties-keywords = Λέξεις-κλειδιά:
pdfjs-document-properties-creation-date = Ημερομηνία δημιουργίας:
pdfjs-document-properties-modification-date = Ημερομηνία τροποποίησης:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Δημιουργός:
pdfjs-document-properties-producer = Παραγωγός PDF:
pdfjs-document-properties-version = Έκδοση PDF:
pdfjs-document-properties-page-count = Αριθμός σελίδων:
pdfjs-document-properties-page-size = Μέγεθος σελίδας:
pdfjs-document-properties-page-size-unit-inches = ίντσες
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = κατακόρυφα
pdfjs-document-properties-page-size-orientation-landscape = οριζόντια
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Επιστολή
pdfjs-document-properties-page-size-name-legal = Τύπου Legal

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
pdfjs-document-properties-linearized = Ταχεία προβολή ιστού:
pdfjs-document-properties-linearized-yes = Ναι
pdfjs-document-properties-linearized-no = Όχι
pdfjs-document-properties-close-button = Κλείσιμο

## Print

pdfjs-print-progress-message = Προετοιμασία του εγγράφου για εκτύπωση…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Ακύρωση
pdfjs-printing-not-supported = Προειδοποίηση: Η εκτύπωση δεν υποστηρίζεται πλήρως από το πρόγραμμα περιήγησης.
pdfjs-printing-not-ready = Προειδοποίηση: Το PDF δεν φορτώθηκε πλήρως για εκτύπωση.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = (Απ)ενεργοποίηση πλαϊνής γραμμής
pdfjs-toggle-sidebar-notification-button =
    .title = (Απ)ενεργοποίηση πλαϊνής γραμμής (το έγγραφο περιέχει περίγραμμα/συνημμένα/επίπεδα)
pdfjs-toggle-sidebar-button-label = (Απ)ενεργοποίηση πλαϊνής γραμμής
pdfjs-document-outline-button =
    .title = Εμφάνιση διάρθρωσης εγγράφου (διπλό κλικ για ανάπτυξη/σύμπτυξη όλων των στοιχείων)
pdfjs-document-outline-button-label = Διάρθρωση εγγράφου
pdfjs-attachments-button =
    .title = Εμφάνιση συνημμένων
pdfjs-attachments-button-label = Συνημμένα
pdfjs-layers-button =
    .title = Εμφάνιση επιπέδων (διπλό κλικ για επαναφορά όλων των επιπέδων στην προεπιλεγμένη κατάσταση)
pdfjs-layers-button-label = Επίπεδα
pdfjs-thumbs-button =
    .title = Εμφάνιση μικρογραφιών
pdfjs-thumbs-button-label = Μικρογραφίες
pdfjs-current-outline-item-button =
    .title = Εύρεση τρέχοντος στοιχείου διάρθρωσης
pdfjs-current-outline-item-button-label = Τρέχον στοιχείο διάρθρωσης
pdfjs-findbar-button =
    .title = Εύρεση στο έγγραφο
pdfjs-findbar-button-label = Εύρεση
pdfjs-additional-layers = Επιπρόσθετα επίπεδα

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Σελίδα { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Μικρογραφία σελίδας { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Εύρεση
    .placeholder = Εύρεση στο έγγραφο…
pdfjs-find-previous-button =
    .title = Εύρεση της προηγούμενης εμφάνισης της φράσης
pdfjs-find-previous-button-label = Προηγούμενο
pdfjs-find-next-button =
    .title = Εύρεση της επόμενης εμφάνισης της φράσης
pdfjs-find-next-button-label = Επόμενο
pdfjs-find-highlight-checkbox = Επισήμανση όλων
pdfjs-find-match-case-checkbox-label = Συμφωνία πεζών/κεφαλαίων
pdfjs-find-match-diacritics-checkbox-label = Αντιστοίχιση διακριτικών
pdfjs-find-entire-word-checkbox-label = Ολόκληρες λέξεις
pdfjs-find-reached-top = Φτάσατε στην αρχή του εγγράφου, συνέχεια από το τέλος
pdfjs-find-reached-bottom = Φτάσατε στο τέλος του εγγράφου, συνέχεια από την αρχή
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } από { $total } αντιστοιχία
       *[other] { $current } από { $total } αντιστοιχίες
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Περισσότερες από { $limit } αντιστοιχία
       *[other] Περισσότερες από { $limit } αντιστοιχίες
    }
pdfjs-find-not-found = Η φράση δεν βρέθηκε

## Predefined zoom values

pdfjs-page-scale-width = Πλάτος σελίδας
pdfjs-page-scale-fit = Μέγεθος σελίδας
pdfjs-page-scale-auto = Αυτόματο ζουμ
pdfjs-page-scale-actual = Πραγματικό μέγεθος
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Σελίδα { $page }

## Loading indicator messages

pdfjs-loading-error = Προέκυψε σφάλμα κατά τη φόρτωση του PDF.
pdfjs-invalid-file-error = Μη έγκυρο ή κατεστραμμένο αρχείο PDF.
pdfjs-missing-file-error = Λείπει αρχείο PDF.
pdfjs-unexpected-response-error = Μη αναμενόμενη απόκριση από το διακομιστή.
pdfjs-rendering-error = Προέκυψε σφάλμα κατά την εμφάνιση της σελίδας.

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
    .alt = [Σχόλιο «{ $type }»]

## Password

pdfjs-password-label = Εισαγάγετε τον κωδικό πρόσβασης για να ανοίξετε αυτό το αρχείο PDF.
pdfjs-password-invalid = Μη έγκυρος κωδικός πρόσβασης. Παρακαλώ δοκιμάστε ξανά.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Ακύρωση
pdfjs-web-fonts-disabled = Οι γραμματοσειρές ιστού είναι ανενεργές: δεν είναι δυνατή η χρήση των ενσωματωμένων γραμματοσειρών PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Κείμενο
pdfjs-editor-free-text-button-label = Κείμενο
pdfjs-editor-ink-button =
    .title = Σχέδιο
pdfjs-editor-ink-button-label = Σχέδιο
pdfjs-editor-stamp-button =
    .title = Προσθήκη ή επεξεργασία εικόνων
pdfjs-editor-stamp-button-label = Προσθήκη ή επεξεργασία εικόνων
pdfjs-editor-highlight-button =
    .title = Επισήμανση
pdfjs-editor-highlight-button-label = Επισήμανση
pdfjs-highlight-floating-button =
    .title = Επισήμανση
pdfjs-highlight-floating-button1 =
    .title = Επισήμανση
    .aria-label = Επισήμανση
pdfjs-highlight-floating-button-label = Επισήμανση

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Αφαίρεση σχεδίου
pdfjs-editor-remove-freetext-button =
    .title = Αφαίρεση κειμένου
pdfjs-editor-remove-stamp-button =
    .title = Αφαίρεση εικόνας
pdfjs-editor-remove-highlight-button =
    .title = Αφαίρεση επισήμανσης

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Χρώμα
pdfjs-editor-free-text-size-input = Μέγεθος
pdfjs-editor-ink-color-input = Χρώμα
pdfjs-editor-ink-thickness-input = Πάχος
pdfjs-editor-ink-opacity-input = Αδιαφάνεια
pdfjs-editor-stamp-add-image-button =
    .title = Προσθήκη εικόνας
pdfjs-editor-stamp-add-image-button-label = Προσθήκη εικόνας
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Πάχος
pdfjs-editor-free-highlight-thickness-title =
    .title = Αλλαγή πάχους κατά την επισήμανση στοιχείων εκτός κειμένου
pdfjs-free-text =
    .aria-label = Επεξεργασία κειμένου
pdfjs-free-text-default-content = Ξεκινήστε να πληκτρολογείτε…
pdfjs-ink =
    .aria-label = Επεξεργασία σχεδίων
pdfjs-ink-canvas =
    .aria-label = Εικόνα από τον χρήστη

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Εναλλακτικό κείμενο
pdfjs-editor-alt-text-edit-button-label = Επεξεργασία εναλλακτικού κειμένου
pdfjs-editor-alt-text-dialog-label = Διαλέξτε μια επιλογή
pdfjs-editor-alt-text-dialog-description = Το εναλλακτικό κείμενο είναι χρήσιμο όταν οι άνθρωποι δεν μπορούν να δουν την εικόνα ή όταν αυτή δεν φορτώνεται.
pdfjs-editor-alt-text-add-description-label = Προσθήκη περιγραφής
pdfjs-editor-alt-text-add-description-description = Στοχεύστε σε μία ή δύο προτάσεις που περιγράφουν το θέμα, τη ρύθμιση ή τις ενέργειες.
pdfjs-editor-alt-text-mark-decorative-label = Επισήμανση ως διακοσμητικό
pdfjs-editor-alt-text-mark-decorative-description = Χρησιμοποιείται για διακοσμητικές εικόνες, όπως περιγράμματα ή υδατογραφήματα.
pdfjs-editor-alt-text-cancel-button = Ακύρωση
pdfjs-editor-alt-text-save-button = Αποθήκευση
pdfjs-editor-alt-text-decorative-tooltip = Επισημασμένο ως διακοσμητικό
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Για παράδειγμα, «Ένας νεαρός άνδρας κάθεται σε ένα τραπέζι για να φάει ένα γεύμα»

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Επάνω αριστερή γωνία — αλλαγή μεγέθους
pdfjs-editor-resizer-label-top-middle = Μέσο επάνω πλευράς — αλλαγή μεγέθους
pdfjs-editor-resizer-label-top-right = Επάνω δεξιά γωνία — αλλαγή μεγέθους
pdfjs-editor-resizer-label-middle-right = Μέσο δεξιάς πλευράς — αλλαγή μεγέθους
pdfjs-editor-resizer-label-bottom-right = Κάτω δεξιά γωνία — αλλαγή μεγέθους
pdfjs-editor-resizer-label-bottom-middle = Μέσο κάτω πλευράς — αλλαγή μεγέθους
pdfjs-editor-resizer-label-bottom-left = Κάτω αριστερή γωνία — αλλαγή μεγέθους
pdfjs-editor-resizer-label-middle-left = Μέσο αριστερής πλευράς — αλλαγή μεγέθους

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Χρώμα επισήμανσης
pdfjs-editor-colorpicker-button =
    .title = Αλλαγή χρώματος
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Επιλογές χρωμάτων
pdfjs-editor-colorpicker-yellow =
    .title = Κίτρινο
pdfjs-editor-colorpicker-green =
    .title = Πράσινο
pdfjs-editor-colorpicker-blue =
    .title = Μπλε
pdfjs-editor-colorpicker-pink =
    .title = Ροζ
pdfjs-editor-colorpicker-red =
    .title = Κόκκινο

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Εμφάνιση όλων
pdfjs-editor-highlight-show-all-button =
    .title = Εμφάνιση όλων
