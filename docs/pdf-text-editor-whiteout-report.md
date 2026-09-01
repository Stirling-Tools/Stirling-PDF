# Reporte de sucesos: herramienta Whiteout

## Suceso

Se implemento la herramienta **Whiteout** dentro del Editor de texto PDF para
cubrir permanentemente zonas del documento, con un comportamiento equivalente al
borrador Whiteout de Nitro PDF.

## Alcance funcional

- Activacion del modo Whiteout desde el panel lateral.
- Creacion de rectangulos mediante arrastre sobre la pagina.
- Eliminacion individual mediante doble clic.
- Limpieza de todos los rectangulos de la pagina seleccionada.
- Persistencia de las coordenadas en el JSON del editor.
- Renderizado de rectangulos blancos durante la exportacion del PDF.
- Reconstruccion completa cuando se modifica Whiteout, para que eliminar un
  rectangulo tambien se refleje en el PDF descargado.

## Archivos de la implementacion

- `frontend/editor/src/core/tools/pdfTextEditor/PdfTextEditor.tsx`
- `frontend/editor/src/core/tools/pdfTextEditor/pdfTextEditorTypes.ts`
- `frontend/editor/src/core/components/tools/pdfTextEditor/PdfTextEditorView.tsx`
- `frontend/editor/src/core/components/tools/pdfTextEditor/PdfTextEditorSidebar.tsx`
- `app/core/src/main/java/stirling/software/SPDF/model/json/PdfJsonPage.java`
- `app/core/src/main/java/stirling/software/SPDF/model/json/PdfJsonWhiteout.java`
- `app/core/src/main/java/stirling/software/SPDF/service/PdfJsonConversionService.java`

## Documentacion de uso

La guia de usuario se encuentra en
`docs/pdf-text-editor-whiteout.md`.

## Validacion y Git

- Se comprobo que el commit `2ec5e73` contiene la implementacion completa.
- Se retiro una reversión staged accidental que eliminaba la herramienta y su
  modelo backend.
- Se verifico el diff con `git diff --check`.
- La compilacion automatica queda condicionada a disponer de Node.js y Java en
  el entorno de ejecucion.
- Este reporte se agrega en la rama `main` junto con el estado funcional
  existente.