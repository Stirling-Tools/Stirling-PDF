# PDF JSON Editor Backlog

- **Type3 Font Support (Text Additions)**
  - Parse Type3 charprocs to extract glyph outlines, build a synthetic TrueType/OpenType font (FontTools, Ghostscript `ps2ttf`, etc.), and store it in `webProgram` / `pdfProgram` for client use.
  - Preserve the original Type3 resources for round-trip fidelity; use the synthesized font only for edited elements while reusing the original stream elsewhere.
  - Extend conversion logic so fallback kicks in only when conversion fails, and track which elements rely on the synthetic font to avoid mixing source glyphs (`PdfJsonConversionService.java:998-1090`, `1840-2012`).
  - Update the viewer/renderer to surface conversion errors and block editing when no faithful font can be produced.

- **Lazy Fetch Endpoints**
  - Provide separate endpoints to fetch:
    1. Raw COS dictionaries/font programs when the user opens advanced panels.
    2. Page-level raster/vector previews to avoid sending large `imageData` upfront.
  - Reuse the existing job cache (`documentCache`) to serve these on demand and clean up after timeouts (`PdfJsonConversionService.java:3608-3687`).

- **Editor UX Safeguards**
  - Respect `fallbackFontService` indicators; mark groups using fallback glyphs so the UI can warn about possible appearance shifts (`frontend/src/proprietary/components/tools/pdfJsonEditor/PdfJsonEditorView.tsx:1260-1287`).
  - Surface when Type3 conversion was downgraded (e.g., rasterized glyphs) and limit editing to operations that keep the PDF stable.

- **Canonical Font Sharing**
  - Emit fonts once per unique embedded program. Add a `canonicalFonts` array containing the full payload (program, ToUnicode, metadata) and a compact `fontAliases` mapping `{pageNumber, fontId, canonicalUid}` so text elements can still reference per-page IDs.
  - Store COS dictionaries only on canonical entries; aliases should keep light fields (e.g., size adjustments) if they differ.
  - Update `buildFontMap` to resolve aliases when recreating PDFBox fonts, and adjust the front end to load programs via the canonical UID.
  - Optional: expose a lazy endpoint for the original COS dictionary if the canonical record strips it, so export still reconstructs untouched fonts.
