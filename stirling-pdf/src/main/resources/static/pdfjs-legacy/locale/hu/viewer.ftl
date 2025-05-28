# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Előző oldal
pdfjs-previous-button-label = Előző
pdfjs-next-button =
    .title = Következő oldal
pdfjs-next-button-label = Tovább
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Oldal
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = összesen: { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } / { $pagesCount })
pdfjs-zoom-out-button =
    .title = Kicsinyítés
pdfjs-zoom-out-button-label = Kicsinyítés
pdfjs-zoom-in-button =
    .title = Nagyítás
pdfjs-zoom-in-button-label = Nagyítás
pdfjs-zoom-select =
    .title = Nagyítás
pdfjs-presentation-mode-button =
    .title = Váltás bemutató módba
pdfjs-presentation-mode-button-label = Bemutató mód
pdfjs-open-file-button =
    .title = Fájl megnyitása
pdfjs-open-file-button-label = Megnyitás
pdfjs-print-button =
    .title = Nyomtatás
pdfjs-print-button-label = Nyomtatás
pdfjs-save-button =
    .title = Mentés
pdfjs-save-button-label = Mentés
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Letöltés
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Letöltés
pdfjs-bookmark-button =
    .title = Jelenlegi oldal (webcím megtekintése a jelenlegi oldalról)
pdfjs-bookmark-button-label = Jelenlegi oldal

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Eszközök
pdfjs-tools-button-label = Eszközök
pdfjs-first-page-button =
    .title = Ugrás az első oldalra
pdfjs-first-page-button-label = Ugrás az első oldalra
pdfjs-last-page-button =
    .title = Ugrás az utolsó oldalra
pdfjs-last-page-button-label = Ugrás az utolsó oldalra
pdfjs-page-rotate-cw-button =
    .title = Forgatás az óramutató járásával egyezően
pdfjs-page-rotate-cw-button-label = Forgatás az óramutató járásával egyezően
pdfjs-page-rotate-ccw-button =
    .title = Forgatás az óramutató járásával ellentétesen
pdfjs-page-rotate-ccw-button-label = Forgatás az óramutató járásával ellentétesen
pdfjs-cursor-text-select-tool-button =
    .title = Szövegkijelölő eszköz bekapcsolása
pdfjs-cursor-text-select-tool-button-label = Szövegkijelölő eszköz
pdfjs-cursor-hand-tool-button =
    .title = Kéz eszköz bekapcsolása
pdfjs-cursor-hand-tool-button-label = Kéz eszköz
pdfjs-scroll-page-button =
    .title = Oldalgörgetés használata
pdfjs-scroll-page-button-label = Oldalgörgetés
pdfjs-scroll-vertical-button =
    .title = Függőleges görgetés használata
pdfjs-scroll-vertical-button-label = Függőleges görgetés
pdfjs-scroll-horizontal-button =
    .title = Vízszintes görgetés használata
pdfjs-scroll-horizontal-button-label = Vízszintes görgetés
pdfjs-scroll-wrapped-button =
    .title = Rácsos elrendezés használata
pdfjs-scroll-wrapped-button-label = Rácsos elrendezés
pdfjs-spread-none-button =
    .title = Ne tapassza össze az oldalakat
pdfjs-spread-none-button-label = Nincs összetapasztás
pdfjs-spread-odd-button =
    .title = Lapok összetapasztása, a páratlan számú oldalakkal kezdve
pdfjs-spread-odd-button-label = Összetapasztás: páratlan
pdfjs-spread-even-button =
    .title = Lapok összetapasztása, a páros számú oldalakkal kezdve
pdfjs-spread-even-button-label = Összetapasztás: páros

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumentum tulajdonságai…
pdfjs-document-properties-button-label = Dokumentum tulajdonságai…
pdfjs-document-properties-file-name = Fájlnév:
pdfjs-document-properties-file-size = Fájlméret:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bájt)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bájt)
pdfjs-document-properties-title = Cím:
pdfjs-document-properties-author = Szerző:
pdfjs-document-properties-subject = Tárgy:
pdfjs-document-properties-keywords = Kulcsszavak:
pdfjs-document-properties-creation-date = Létrehozás dátuma:
pdfjs-document-properties-modification-date = Módosítás dátuma:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Létrehozta:
pdfjs-document-properties-producer = PDF előállító:
pdfjs-document-properties-version = PDF verzió:
pdfjs-document-properties-page-count = Oldalszám:
pdfjs-document-properties-page-size = Lapméret:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = álló
pdfjs-document-properties-page-size-orientation-landscape = fekvő
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Letter
pdfjs-document-properties-page-size-name-legal = Jogi információk

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
pdfjs-document-properties-linearized = Gyors webes nézet:
pdfjs-document-properties-linearized-yes = Igen
pdfjs-document-properties-linearized-no = Nem
pdfjs-document-properties-close-button = Bezárás

## Print

pdfjs-print-progress-message = Dokumentum előkészítése nyomtatáshoz…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Mégse
pdfjs-printing-not-supported = Figyelmeztetés: Ez a böngésző nem teljesen támogatja a nyomtatást.
pdfjs-printing-not-ready = Figyelmeztetés: A PDF nincs teljesen betöltve a nyomtatáshoz.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Oldalsáv be/ki
pdfjs-toggle-sidebar-notification-button =
    .title = Oldalsáv be/ki (a dokumentum vázlatot/mellékleteket/rétegeket tartalmaz)
pdfjs-toggle-sidebar-button-label = Oldalsáv be/ki
pdfjs-document-outline-button =
    .title = Dokumentum megjelenítése online (dupla kattintás minden elem kinyitásához/összecsukásához)
pdfjs-document-outline-button-label = Dokumentumvázlat
pdfjs-attachments-button =
    .title = Mellékletek megjelenítése
pdfjs-attachments-button-label = Van melléklet
pdfjs-layers-button =
    .title = Rétegek megjelenítése (dupla kattintás az összes réteg alapértelmezett állapotra visszaállításához)
pdfjs-layers-button-label = Rétegek
pdfjs-thumbs-button =
    .title = Bélyegképek megjelenítése
pdfjs-thumbs-button-label = Bélyegképek
pdfjs-current-outline-item-button =
    .title = Jelenlegi vázlatelem megkeresése
pdfjs-current-outline-item-button-label = Jelenlegi vázlatelem
pdfjs-findbar-button =
    .title = Keresés a dokumentumban
pdfjs-findbar-button-label = Keresés
pdfjs-additional-layers = További rétegek

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = { $page }. oldal
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page }. oldal bélyegképe

## Find panel button title and messages

pdfjs-find-input =
    .title = Keresés
    .placeholder = Keresés a dokumentumban…
pdfjs-find-previous-button =
    .title = A kifejezés előző előfordulásának keresése
pdfjs-find-previous-button-label = Előző
pdfjs-find-next-button =
    .title = A kifejezés következő előfordulásának keresése
pdfjs-find-next-button-label = Tovább
pdfjs-find-highlight-checkbox = Összes kiemelése
pdfjs-find-match-case-checkbox-label = Kis- és nagybetűk megkülönböztetése
pdfjs-find-match-diacritics-checkbox-label = Diakritikus jelek
pdfjs-find-entire-word-checkbox-label = Teljes szavak
pdfjs-find-reached-top = A dokumentum eleje elérve, folytatás a végétől
pdfjs-find-reached-bottom = A dokumentum vége elérve, folytatás az elejétől
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } / { $total } találat
       *[other] { $current } / { $total } találat
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Több mint { $limit } találat
       *[other] Több mint { $limit } találat
    }
pdfjs-find-not-found = A kifejezés nem található

## Predefined zoom values

pdfjs-page-scale-width = Oldalszélesség
pdfjs-page-scale-fit = Teljes oldal
pdfjs-page-scale-auto = Automatikus nagyítás
pdfjs-page-scale-actual = Valódi méret
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = { $page }. oldal

## Loading indicator messages

pdfjs-loading-error = Hiba történt a PDF betöltésekor.
pdfjs-invalid-file-error = Érvénytelen vagy sérült PDF fájl.
pdfjs-missing-file-error = Hiányzó PDF fájl.
pdfjs-unexpected-response-error = Váratlan kiszolgálóválasz.
pdfjs-rendering-error = Hiba történt az oldal feldolgozása közben.

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
    .alt = [{ $type } megjegyzés]

## Password

pdfjs-password-label = Adja meg a jelszót a PDF fájl megnyitásához.
pdfjs-password-invalid = Helytelen jelszó. Próbálja újra.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Mégse
pdfjs-web-fonts-disabled = Webes betűkészletek letiltva: nem használhatók a beágyazott PDF betűkészletek.

## Editing

pdfjs-editor-free-text-button =
    .title = Szöveg
pdfjs-editor-free-text-button-label = Szöveg
pdfjs-editor-ink-button =
    .title = Rajzolás
pdfjs-editor-ink-button-label = Rajzolás
pdfjs-editor-stamp-button =
    .title = Képek hozzáadása vagy szerkesztése
pdfjs-editor-stamp-button-label = Képek hozzáadása vagy szerkesztése
pdfjs-editor-highlight-button =
    .title = Kiemelés
pdfjs-editor-highlight-button-label = Kiemelés
pdfjs-highlight-floating-button =
    .title = Kiemelés
pdfjs-highlight-floating-button1 =
    .title = Kiemelés
    .aria-label = Kiemelés
pdfjs-highlight-floating-button-label = Kiemelés

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Rajz eltávolítása
pdfjs-editor-remove-freetext-button =
    .title = Szöveg eltávolítása
pdfjs-editor-remove-stamp-button =
    .title = Kép eltávolítása
pdfjs-editor-remove-highlight-button =
    .title = Kiemelés eltávolítása

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Szín
pdfjs-editor-free-text-size-input = Méret
pdfjs-editor-ink-color-input = Szín
pdfjs-editor-ink-thickness-input = Vastagság
pdfjs-editor-ink-opacity-input = Átlátszatlanság
pdfjs-editor-stamp-add-image-button =
    .title = Kép hozzáadása
pdfjs-editor-stamp-add-image-button-label = Kép hozzáadása
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Vastagság
pdfjs-editor-free-highlight-thickness-title =
    .title = Vastagság módosítása, ha nem szöveges elemeket emel ki
pdfjs-free-text =
    .aria-label = Szövegszerkesztő
pdfjs-free-text-default-content = Kezdjen el gépelni…
pdfjs-ink =
    .aria-label = Rajzszerkesztő
pdfjs-ink-canvas =
    .aria-label = Felhasználó által készített kép

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternatív szöveg
pdfjs-editor-alt-text-edit-button-label = Alternatív szöveg szerkesztése
pdfjs-editor-alt-text-dialog-label = Válasszon egy lehetőséget
pdfjs-editor-alt-text-dialog-description = Az alternatív szöveg segít, ha az emberek nem látják a képet, vagy ha az nem töltődik be.
pdfjs-editor-alt-text-add-description-label = Leírás hozzáadása
pdfjs-editor-alt-text-add-description-description = Törekedjen 1-2 mondatra, amely jellemzi a témát, környezetet vagy cselekvést.
pdfjs-editor-alt-text-mark-decorative-label = Megjelölés dekoratívként
pdfjs-editor-alt-text-mark-decorative-description = Ez a díszítőképeknél használatos, mint a szegélyek vagy a vízjelek.
pdfjs-editor-alt-text-cancel-button = Mégse
pdfjs-editor-alt-text-save-button = Mentés
pdfjs-editor-alt-text-decorative-tooltip = Megjelölve dekoratívként
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Például: „Egy fiatal férfi leül enni egy asztalhoz”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Bal felső sarok – átméretezés
pdfjs-editor-resizer-label-top-middle = Felül középen – átméretezés
pdfjs-editor-resizer-label-top-right = Jobb felső sarok – átméretezés
pdfjs-editor-resizer-label-middle-right = Jobbra középen – átméretezés
pdfjs-editor-resizer-label-bottom-right = Jobb alsó sarok – átméretezés
pdfjs-editor-resizer-label-bottom-middle = Alul középen – átméretezés
pdfjs-editor-resizer-label-bottom-left = Bal alsó sarok – átméretezés
pdfjs-editor-resizer-label-middle-left = Balra középen – átméretezés

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Kiemelés színe
pdfjs-editor-colorpicker-button =
    .title = Szín módosítása
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Színválasztások
pdfjs-editor-colorpicker-yellow =
    .title = Sárga
pdfjs-editor-colorpicker-green =
    .title = Zöld
pdfjs-editor-colorpicker-blue =
    .title = Kék
pdfjs-editor-colorpicker-pink =
    .title = Rózsaszín
pdfjs-editor-colorpicker-red =
    .title = Vörös

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Összes megjelenítése
pdfjs-editor-highlight-show-all-button =
    .title = Összes megjelenítése
