# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Přejde na předchozí stránku
pdfjs-previous-button-label = Předchozí
pdfjs-next-button =
    .title = Přejde na následující stránku
pdfjs-next-button-label = Další
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Stránka
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = z { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } z { $pagesCount })
pdfjs-zoom-out-button =
    .title = Zmenší velikost
pdfjs-zoom-out-button-label = Zmenšit
pdfjs-zoom-in-button =
    .title = Zvětší velikost
pdfjs-zoom-in-button-label = Zvětšit
pdfjs-zoom-select =
    .title = Nastaví velikost
pdfjs-presentation-mode-button =
    .title = Přepne do režimu prezentace
pdfjs-presentation-mode-button-label = Režim prezentace
pdfjs-open-file-button =
    .title = Otevře soubor
pdfjs-open-file-button-label = Otevřít
pdfjs-print-button =
    .title = Vytiskne dokument
pdfjs-print-button-label = Vytisknout
pdfjs-save-button =
    .title = Uložit
pdfjs-save-button-label = Uložit
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Stáhnout
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Stáhnout
pdfjs-bookmark-button =
    .title = Aktuální stránka (zobrazit URL od aktuální stránky)
pdfjs-bookmark-button-label = Aktuální stránka
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = Otevřít v aplikaci
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = Otevřít v aplikaci

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Nástroje
pdfjs-tools-button-label = Nástroje
pdfjs-first-page-button =
    .title = Přejde na první stránku
pdfjs-first-page-button-label = Přejít na první stránku
pdfjs-last-page-button =
    .title = Přejde na poslední stránku
pdfjs-last-page-button-label = Přejít na poslední stránku
pdfjs-page-rotate-cw-button =
    .title = Otočí po směru hodin
pdfjs-page-rotate-cw-button-label = Otočit po směru hodin
pdfjs-page-rotate-ccw-button =
    .title = Otočí proti směru hodin
pdfjs-page-rotate-ccw-button-label = Otočit proti směru hodin
pdfjs-cursor-text-select-tool-button =
    .title = Povolí výběr textu
pdfjs-cursor-text-select-tool-button-label = Výběr textu
pdfjs-cursor-hand-tool-button =
    .title = Povolí nástroj ručička
pdfjs-cursor-hand-tool-button-label = Nástroj ručička
pdfjs-scroll-page-button =
    .title = Posouvat po stránkách
pdfjs-scroll-page-button-label = Posouvání po stránkách
pdfjs-scroll-vertical-button =
    .title = Použít svislé posouvání
pdfjs-scroll-vertical-button-label = Svislé posouvání
pdfjs-scroll-horizontal-button =
    .title = Použít vodorovné posouvání
pdfjs-scroll-horizontal-button-label = Vodorovné posouvání
pdfjs-scroll-wrapped-button =
    .title = Použít postupné posouvání
pdfjs-scroll-wrapped-button-label = Postupné posouvání
pdfjs-spread-none-button =
    .title = Nesdružovat stránky
pdfjs-spread-none-button-label = Žádné sdružení
pdfjs-spread-odd-button =
    .title = Sdruží stránky s umístěním lichých vlevo
pdfjs-spread-odd-button-label = Sdružení stránek (liché vlevo)
pdfjs-spread-even-button =
    .title = Sdruží stránky s umístěním sudých vlevo
pdfjs-spread-even-button-label = Sdružení stránek (sudé vlevo)

## Document properties dialog

pdfjs-document-properties-button =
    .title = Vlastnosti dokumentu…
pdfjs-document-properties-button-label = Vlastnosti dokumentu…
pdfjs-document-properties-file-name = Název souboru:
pdfjs-document-properties-file-size = Velikost souboru:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bajtů)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bajtů)
pdfjs-document-properties-title = Název stránky:
pdfjs-document-properties-author = Autor:
pdfjs-document-properties-subject = Předmět:
pdfjs-document-properties-keywords = Klíčová slova:
pdfjs-document-properties-creation-date = Datum vytvoření:
pdfjs-document-properties-modification-date = Datum úpravy:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Vytvořil:
pdfjs-document-properties-producer = Tvůrce PDF:
pdfjs-document-properties-version = Verze PDF:
pdfjs-document-properties-page-count = Počet stránek:
pdfjs-document-properties-page-size = Velikost stránky:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = na výšku
pdfjs-document-properties-page-size-orientation-landscape = na šířku
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Dopis
pdfjs-document-properties-page-size-name-legal = Právní dokument

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
pdfjs-document-properties-linearized = Rychlé zobrazování z webu:
pdfjs-document-properties-linearized-yes = Ano
pdfjs-document-properties-linearized-no = Ne
pdfjs-document-properties-close-button = Zavřít

## Print

pdfjs-print-progress-message = Příprava dokumentu pro tisk…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress } %
pdfjs-print-progress-close-button = Zrušit
pdfjs-printing-not-supported = Upozornění: Tisk není v tomto prohlížeči plně podporován.
pdfjs-printing-not-ready = Upozornění: Dokument PDF není kompletně načten.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Postranní lišta
pdfjs-toggle-sidebar-notification-button =
    .title = Přepnout postranní lištu (dokument obsahuje osnovu/přílohy/vrstvy)
pdfjs-toggle-sidebar-button-label = Postranní lišta
pdfjs-document-outline-button =
    .title = Zobrazí osnovu dokumentu (poklepání přepne zobrazení všech položek)
pdfjs-document-outline-button-label = Osnova dokumentu
pdfjs-attachments-button =
    .title = Zobrazí přílohy
pdfjs-attachments-button-label = Přílohy
pdfjs-layers-button =
    .title = Zobrazit vrstvy (poklepáním obnovíte všechny vrstvy do výchozího stavu)
pdfjs-layers-button-label = Vrstvy
pdfjs-thumbs-button =
    .title = Zobrazí náhledy
pdfjs-thumbs-button-label = Náhledy
pdfjs-current-outline-item-button =
    .title = Najít aktuální položku v osnově
pdfjs-current-outline-item-button-label = Aktuální položka v osnově
pdfjs-findbar-button =
    .title = Najde v dokumentu
pdfjs-findbar-button-label = Najít
pdfjs-additional-layers = Další vrstvy

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Strana { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Náhled strany { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Najít
    .placeholder = Najít v dokumentu…
pdfjs-find-previous-button =
    .title = Najde předchozí výskyt hledaného textu
pdfjs-find-previous-button-label = Předchozí
pdfjs-find-next-button =
    .title = Najde další výskyt hledaného textu
pdfjs-find-next-button-label = Další
pdfjs-find-highlight-checkbox = Zvýraznit
pdfjs-find-match-case-checkbox-label = Rozlišovat velikost
pdfjs-find-match-diacritics-checkbox-label = Rozlišovat diakritiku
pdfjs-find-entire-word-checkbox-label = Celá slova
pdfjs-find-reached-top = Dosažen začátek dokumentu, pokračuje se od konce
pdfjs-find-reached-bottom = Dosažen konec dokumentu, pokračuje se od začátku
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current }. z { $total } výskytu
        [few] { $current }. z { $total } výskytů
        [many] { $current }. z { $total } výskytů
       *[other] { $current }. z { $total } výskytů
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Více než { $limit } výskyt
        [few] Více než { $limit } výskyty
        [many] Více než { $limit } výskytů
       *[other] Více než { $limit } výskytů
    }
pdfjs-find-not-found = Hledaný text nenalezen

## Predefined zoom values

pdfjs-page-scale-width = Podle šířky
pdfjs-page-scale-fit = Podle výšky
pdfjs-page-scale-auto = Automatická velikost
pdfjs-page-scale-actual = Skutečná velikost
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale } %

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Strana { $page }

## Loading indicator messages

pdfjs-loading-error = Při nahrávání PDF nastala chyba.
pdfjs-invalid-file-error = Neplatný nebo chybný soubor PDF.
pdfjs-missing-file-error = Chybí soubor PDF.
pdfjs-unexpected-response-error = Neočekávaná odpověď serveru.
pdfjs-rendering-error = Při vykreslování stránky nastala chyba.

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
    .alt = [Anotace typu { $type }]

## Password

pdfjs-password-label = Pro otevření PDF souboru vložte heslo.
pdfjs-password-invalid = Neplatné heslo. Zkuste to znovu.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Zrušit
pdfjs-web-fonts-disabled = Webová písma jsou zakázána, proto není možné použít vložená písma PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Text
pdfjs-editor-free-text-button-label = Text
pdfjs-editor-ink-button =
    .title = Kreslení
pdfjs-editor-ink-button-label = Kreslení
pdfjs-editor-stamp-button =
    .title = Přidání či úprava obrázků
pdfjs-editor-stamp-button-label = Přidání či úprava obrázků
pdfjs-editor-highlight-button =
    .title = Zvýraznění
pdfjs-editor-highlight-button-label = Zvýraznění
pdfjs-highlight-floating-button =
    .title = Zvýraznit
pdfjs-highlight-floating-button1 =
    .title = Zvýraznit
    .aria-label = Zvýraznit
pdfjs-highlight-floating-button-label = Zvýraznit

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Odebrat kresbu
pdfjs-editor-remove-freetext-button =
    .title = Odebrat text
pdfjs-editor-remove-stamp-button =
    .title = Odebrat obrázek
pdfjs-editor-remove-highlight-button =
    .title = Odebrat zvýraznění

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Barva
pdfjs-editor-free-text-size-input = Velikost
pdfjs-editor-ink-color-input = Barva
pdfjs-editor-ink-thickness-input = Tloušťka
pdfjs-editor-ink-opacity-input = Průhlednost
pdfjs-editor-stamp-add-image-button =
    .title = Přidat obrázek
pdfjs-editor-stamp-add-image-button-label = Přidat obrázek
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Tloušťka
pdfjs-editor-free-highlight-thickness-title =
    .title = Změna tloušťky při zvýrazňování jiných položek než textu
pdfjs-free-text =
    .aria-label = Textový editor
pdfjs-free-text-default-content = Začněte psát…
pdfjs-ink =
    .aria-label = Editor kreslení
pdfjs-ink-canvas =
    .aria-label = Uživatelem vytvořený obrázek

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Náhradní popis
pdfjs-editor-alt-text-edit-button-label = Upravit náhradní popis
pdfjs-editor-alt-text-dialog-label = Vyberte možnost
pdfjs-editor-alt-text-dialog-description = Náhradní popis pomáhá, když lidé obrázek nevidí nebo když se nenačítá.
pdfjs-editor-alt-text-add-description-label = Přidat popis
pdfjs-editor-alt-text-add-description-description = Snažte se o 1-2 věty, které popisují předmět, prostředí nebo činnosti.
pdfjs-editor-alt-text-mark-decorative-label = Označit jako dekorativní
pdfjs-editor-alt-text-mark-decorative-description = Používá se pro okrasné obrázky, jako jsou rámečky nebo vodoznaky.
pdfjs-editor-alt-text-cancel-button = Zrušit
pdfjs-editor-alt-text-save-button = Uložit
pdfjs-editor-alt-text-decorative-tooltip = Označen jako dekorativní
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Například: “Mladý muž si sedá ke stolu, aby se najedl.”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Levý horní roh — změna velikosti
pdfjs-editor-resizer-label-top-middle = Horní střed — změna velikosti
pdfjs-editor-resizer-label-top-right = Pravý horní roh — změna velikosti
pdfjs-editor-resizer-label-middle-right = Vpravo uprostřed — změna velikosti
pdfjs-editor-resizer-label-bottom-right = Pravý dolní roh — změna velikosti
pdfjs-editor-resizer-label-bottom-middle = Střed dole — změna velikosti
pdfjs-editor-resizer-label-bottom-left = Levý dolní roh — změna velikosti
pdfjs-editor-resizer-label-middle-left = Vlevo uprostřed — změna velikosti

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Barva zvýraznění
pdfjs-editor-colorpicker-button =
    .title = Změna barvy
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Výběr barev
pdfjs-editor-colorpicker-yellow =
    .title = Žlutá
pdfjs-editor-colorpicker-green =
    .title = Zelená
pdfjs-editor-colorpicker-blue =
    .title = Modrá
pdfjs-editor-colorpicker-pink =
    .title = Růžová
pdfjs-editor-colorpicker-red =
    .title = Červená

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Zobrazit vše
pdfjs-editor-highlight-show-all-button =
    .title = Zobrazit vše
