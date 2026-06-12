# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pagina precedente
pdfjs-previous-button-label = Precedente
pdfjs-next-button =
    .title = Pagina successiva
pdfjs-next-button-label = Successiva
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pagina
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = di { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } di { $pagesCount })
pdfjs-zoom-out-button =
    .title = Riduci zoom
pdfjs-zoom-out-button-label = Riduci zoom
pdfjs-zoom-in-button =
    .title = Aumenta zoom
pdfjs-zoom-in-button-label = Aumenta zoom
pdfjs-zoom-select =
    .title = Zoom
pdfjs-presentation-mode-button =
    .title = Passa alla modalità presentazione
pdfjs-presentation-mode-button-label = Modalità presentazione
pdfjs-open-file-button =
    .title = Apri file
pdfjs-open-file-button-label = Apri
pdfjs-print-button =
    .title = Stampa
pdfjs-print-button-label = Stampa
pdfjs-save-button =
    .title = Salva
pdfjs-save-button-label = Salva
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Scarica
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Scarica
pdfjs-bookmark-button =
    .title = Pagina corrente (mostra URL della pagina corrente)
pdfjs-bookmark-button-label = Pagina corrente

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Strumenti
pdfjs-tools-button-label = Strumenti
pdfjs-first-page-button =
    .title = Vai alla prima pagina
pdfjs-first-page-button-label = Vai alla prima pagina
pdfjs-last-page-button =
    .title = Vai all’ultima pagina
pdfjs-last-page-button-label = Vai all’ultima pagina
pdfjs-page-rotate-cw-button =
    .title = Ruota in senso orario
pdfjs-page-rotate-cw-button-label = Ruota in senso orario
pdfjs-page-rotate-ccw-button =
    .title = Ruota in senso antiorario
pdfjs-page-rotate-ccw-button-label = Ruota in senso antiorario
pdfjs-cursor-text-select-tool-button =
    .title = Attiva strumento di selezione testo
pdfjs-cursor-text-select-tool-button-label = Strumento di selezione testo
pdfjs-cursor-hand-tool-button =
    .title = Attiva strumento mano
pdfjs-cursor-hand-tool-button-label = Strumento mano
pdfjs-scroll-page-button =
    .title = Utilizza scorrimento pagine
pdfjs-scroll-page-button-label = Scorrimento pagine
pdfjs-scroll-vertical-button =
    .title = Scorri le pagine in verticale
pdfjs-scroll-vertical-button-label = Scorrimento verticale
pdfjs-scroll-horizontal-button =
    .title = Scorri le pagine in orizzontale
pdfjs-scroll-horizontal-button-label = Scorrimento orizzontale
pdfjs-scroll-wrapped-button =
    .title = Scorri le pagine in verticale, disponendole da sinistra a destra e andando a capo automaticamente
pdfjs-scroll-wrapped-button-label = Scorrimento con a capo automatico
pdfjs-spread-none-button =
    .title = Non raggruppare pagine
pdfjs-spread-none-button-label = Nessun raggruppamento
pdfjs-spread-odd-button =
    .title = Crea gruppi di pagine che iniziano con numeri di pagina dispari
pdfjs-spread-odd-button-label = Raggruppamento dispari
pdfjs-spread-even-button =
    .title = Crea gruppi di pagine che iniziano con numeri di pagina pari
pdfjs-spread-even-button-label = Raggruppamento pari

## Document properties dialog

pdfjs-document-properties-button =
    .title = Proprietà del documento…
pdfjs-document-properties-button-label = Proprietà del documento…
pdfjs-document-properties-file-name = Nome file:
pdfjs-document-properties-file-size = Dimensione file:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } kB ({ $size_b } byte)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } byte)
pdfjs-document-properties-title = Titolo:
pdfjs-document-properties-author = Autore:
pdfjs-document-properties-subject = Oggetto:
pdfjs-document-properties-keywords = Parole chiave:
pdfjs-document-properties-creation-date = Data creazione:
pdfjs-document-properties-modification-date = Data modifica:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = Autore originale:
pdfjs-document-properties-producer = Produttore PDF:
pdfjs-document-properties-version = Versione PDF:
pdfjs-document-properties-page-count = Conteggio pagine:
pdfjs-document-properties-page-size = Dimensioni pagina:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = verticale
pdfjs-document-properties-page-size-orientation-landscape = orizzontale
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Lettera
pdfjs-document-properties-page-size-name-legal = Legale

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
pdfjs-document-properties-linearized = Visualizzazione web veloce:
pdfjs-document-properties-linearized-yes = Sì
pdfjs-document-properties-linearized-no = No
pdfjs-document-properties-close-button = Chiudi

## Print

pdfjs-print-progress-message = Preparazione documento per la stampa…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Annulla
pdfjs-printing-not-supported = Attenzione: la stampa non è completamente supportata da questo browser.
pdfjs-printing-not-ready = Attenzione: il PDF non è ancora stato caricato completamente per la stampa.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Attiva/disattiva barra laterale
pdfjs-toggle-sidebar-notification-button =
    .title = Attiva/disattiva barra laterale (il documento contiene struttura/allegati/livelli)
pdfjs-toggle-sidebar-button-label = Attiva/disattiva barra laterale
pdfjs-document-outline-button =
    .title = Visualizza la struttura del documento (doppio clic per visualizzare/comprimere tutti gli elementi)
pdfjs-document-outline-button-label = Struttura documento
pdfjs-attachments-button =
    .title = Visualizza allegati
pdfjs-attachments-button-label = Allegati
pdfjs-layers-button =
    .title = Visualizza livelli (doppio clic per ripristinare tutti i livelli allo stato predefinito)
pdfjs-layers-button-label = Livelli
pdfjs-thumbs-button =
    .title = Mostra le miniature
pdfjs-thumbs-button-label = Miniature
pdfjs-current-outline-item-button =
    .title = Trova elemento struttura corrente
pdfjs-current-outline-item-button-label = Elemento struttura corrente
pdfjs-findbar-button =
    .title = Trova nel documento
pdfjs-findbar-button-label = Trova
pdfjs-additional-layers = Livelli aggiuntivi

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pagina { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura della pagina { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Trova
    .placeholder = Trova nel documento…
pdfjs-find-previous-button =
    .title = Trova l’occorrenza precedente del testo da cercare
pdfjs-find-previous-button-label = Precedente
pdfjs-find-next-button =
    .title = Trova l’occorrenza successiva del testo da cercare
pdfjs-find-next-button-label = Successivo
pdfjs-find-highlight-checkbox = Evidenzia
pdfjs-find-match-case-checkbox-label = Maiuscole/minuscole
pdfjs-find-match-diacritics-checkbox-label = Segni diacritici
pdfjs-find-entire-word-checkbox-label = Parole intere
pdfjs-find-reached-top = Raggiunto l’inizio della pagina, continua dalla fine
pdfjs-find-reached-bottom = Raggiunta la fine della pagina, continua dall’inizio

# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } di { $total } corrispondenza
       *[other] { $current } di { $total } corrispondenze
    }

# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Più di una { $limit } corrispondenza
       *[other] Più di { $limit } corrispondenze
    }

pdfjs-find-not-found = Testo non trovato

## Predefined zoom values

pdfjs-page-scale-width = Larghezza pagina
pdfjs-page-scale-fit = Adatta a una pagina
pdfjs-page-scale-auto = Zoom automatico
pdfjs-page-scale-actual = Dimensioni effettive
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Pagina { $page }

## Loading indicator messages

pdfjs-loading-error = Si è verificato un errore durante il caricamento del PDF.
pdfjs-invalid-file-error = File PDF non valido o danneggiato.
pdfjs-missing-file-error = File PDF non disponibile.
pdfjs-unexpected-response-error = Risposta imprevista del server
pdfjs-rendering-error = Si è verificato un errore durante il rendering della pagina.

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
    .alt = [Annotazione: { $type }]

## Password

pdfjs-password-label = Inserire la password per aprire questo file PDF.
pdfjs-password-invalid = Password non corretta. Riprovare.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Annulla
pdfjs-web-fonts-disabled = I web font risultano disattivati: impossibile utilizzare i caratteri incorporati nel PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Testo
pdfjs-editor-free-text-button-label = Testo
pdfjs-editor-ink-button =
    .title = Disegno
pdfjs-editor-ink-button-label = Disegno
pdfjs-editor-stamp-button =
    .title = Aggiungi o rimuovi immagine
pdfjs-editor-stamp-button-label = Aggiungi o rimuovi immagine
pdfjs-editor-highlight-button =
    .title = Evidenzia
pdfjs-editor-highlight-button-label = Evidenzia
pdfjs-highlight-floating-button1 =
    .title = Evidenzia
    .aria-label = Evidenzia
pdfjs-highlight-floating-button-label = Evidenzia

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Rimuovi disegno
pdfjs-editor-remove-freetext-button =
    .title = Rimuovi testo
pdfjs-editor-remove-stamp-button =
    .title = Rimuovi immagine
pdfjs-editor-remove-highlight-button =
    .title = Rimuovi evidenziazione

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Colore
pdfjs-editor-free-text-size-input = Dimensione
pdfjs-editor-ink-color-input = Colore
pdfjs-editor-ink-thickness-input = Spessore
pdfjs-editor-ink-opacity-input = Opacità
pdfjs-editor-stamp-add-image-button =
    .title = Aggiungi immagine
pdfjs-editor-stamp-add-image-button-label = Aggiungi immagine
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Spessore
pdfjs-editor-free-highlight-thickness-title =
    .title = Modifica lo spessore della selezione per elementi non testuali

pdfjs-free-text =
    .aria-label = Editor di testo
pdfjs-free-text-default-content = Inizia a digitare…
pdfjs-ink =
    .aria-label = Editor disegni
pdfjs-ink-canvas =
    .aria-label = Immagine creata dall’utente

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Testo alternativo
pdfjs-editor-alt-text-edit-button-label = Modifica testo alternativo
pdfjs-editor-alt-text-dialog-label = Scegli un’opzione
pdfjs-editor-alt-text-dialog-description = Il testo alternativo (“alt text”) aiuta quando le persone non possono vedere l’immagine o quando l’immagine non viene caricata.
pdfjs-editor-alt-text-add-description-label = Aggiungi una descrizione
pdfjs-editor-alt-text-add-description-description = Punta a una o due frasi che descrivono l’argomento, l’ambientazione o le azioni.
pdfjs-editor-alt-text-mark-decorative-label = Contrassegna come decorativa
pdfjs-editor-alt-text-mark-decorative-description = Viene utilizzato per immagini ornamentali, come bordi o filigrane.
pdfjs-editor-alt-text-cancel-button = Annulla
pdfjs-editor-alt-text-save-button = Salva
pdfjs-editor-alt-text-decorative-tooltip = Contrassegnata come decorativa
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Ad esempio, “Un giovane si siede a tavola per mangiare”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Angolo in alto a sinistra — ridimensiona
pdfjs-editor-resizer-label-top-middle = Lato superiore nel mezzo — ridimensiona
pdfjs-editor-resizer-label-top-right = Angolo in alto a destra — ridimensiona
pdfjs-editor-resizer-label-middle-right = Lato destro nel mezzo — ridimensiona
pdfjs-editor-resizer-label-bottom-right = Angolo in basso a destra — ridimensiona
pdfjs-editor-resizer-label-bottom-middle = Lato inferiore nel mezzo — ridimensiona
pdfjs-editor-resizer-label-bottom-left = Angolo in basso a sinistra — ridimensiona
pdfjs-editor-resizer-label-middle-left = Lato sinistro nel mezzo — ridimensiona

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Colore evidenziatore

pdfjs-editor-colorpicker-button =
    .title = Cambia colore
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Colori disponibili
pdfjs-editor-colorpicker-yellow =
    .title = Giallo
pdfjs-editor-colorpicker-green =
    .title = Verde
pdfjs-editor-colorpicker-blue =
    .title = Blu
pdfjs-editor-colorpicker-pink =
    .title = Rosa
pdfjs-editor-colorpicker-red =
    .title = Rosso

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Mostra tutto
pdfjs-editor-highlight-show-all-button =
    .title = Mostra tutto
