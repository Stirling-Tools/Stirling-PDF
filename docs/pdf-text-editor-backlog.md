# PDF Text Editor Backlog

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
  - Mark groups using fallback glyphs so the UI can warn about possible appearance shifts. Font family matching is now implemented (Liberation fonts), but weight matching is still TODO, so bold/italic text using fallbacks may appear lighter than original.
  - Surface when Type3 conversion was downgraded (e.g., rasterized glyphs) and limit editing to operations that keep the PDF stable.
  - Reference: `frontend/src/proprietary/components/tools/pdfTextEditor/PdfTextEditorView.tsx:1260-1287`

- **Canonical Font Sharing**
  - Emit fonts once per unique embedded program. Add a `canonicalFonts` array containing the full payload (program, ToUnicode, metadata) and a compact `fontAliases` mapping `{pageNumber, fontId, canonicalUid}` so text elements can still reference per-page IDs.
  - Note: COS dictionaries are currently preserved for TrueType/Type0 fonts (needed for ToUnicode CMap). The canonical approach should maintain this preservation while deduplicating font programs.
  - Update `buildFontMap` to resolve aliases when recreating PDFBox fonts, and adjust the front end to load programs via the canonical UID.
  - Optional: expose a lazy endpoint for the original COS dictionary if the canonical record strips it, so export still reconstructs untouched fonts.

- **Font Weight Matching for Fallback Fonts** ✓ COMPLETED (January 2025)
  - Font family matching is now implemented:
    - Liberation fonts (metric-compatible with Microsoft core): Arial/Helvetica→LiberationSans, Times→LiberationSerif, Courier→LiberationMono
    - DejaVu fonts (widely used open source): DejaVu→DejaVuSans, DejaVuSerif, DejaVuMono
    - Noto fonts (Google universal font): Noto→NotoSans
  - Font weight/style matching is now implemented for multiple font families:
    - Liberation Sans/Serif/Mono: Regular, Bold, Italic, BoldItalic (full support)
    - Noto Sans: Regular, Bold, Italic, BoldItalic (full support)
    - DejaVu Sans/Serif/Mono: Regular, Bold, Italic/Oblique, BoldItalic/BoldOblique (full support)
  - All font variants registered in `BUILT_IN_FALLBACK_FONTS` map (`PdfJsonFallbackFontService.java:63-267`)
  - Weight/style detection implemented in `resolveFallbackFontId()`:
    - `detectBold()`: Detects "bold", "heavy", "black", or numeric weights 600-900 (e.g., "700wght")
    - `detectItalic()`: Detects "italic" or "oblique"
    - `applyWeightStyle()`: Applies appropriate suffix (handles both "italic" and "oblique" naming)
  - All fonts consolidated from Type3 library into main fonts directory for unified fallback support
  - Benefits: Comprehensive visual consistency when editing text in bold/italic fonts across many font families

- **Font Text Color Support**
  - Add support for reading and preserving text color information from PDF content streams
  - Enable color editing in the editor UI
  - Ensure proper round-trip conversion maintains color fidelity

- **Space Character Handling**
  - Improve handling of space characters as proper text elements
  - Ensure spaces are correctly preserved during text extraction and reconstruction
  - Fix any issues with space positioning and width calculations

- **Textbox Selection Enhancement**
  - Improve textbox selection behavior in the editor
  - Enhance user experience for selecting and manipulating text boxes
  - Address any selection precision or interaction issues
