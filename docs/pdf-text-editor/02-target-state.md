# PDF Text Editor v2 - target state

The v2 editor is a **browser-first, PDFium-native** PDF text editor. The
backend keeps only one optional helper endpoint; everything else - parsing,
editing, font handling, save - runs on the user's machine.

This document is the target spec the implementation is held to.

---

## 1. User spec - what v2 should do

### 1.1 Same as v1, but better

Everything the v1 editor does in section 1.2 of `01-current-state.md` v2 also
does. Specifically:

- Open a PDF.
- See the page rendered faithfully.
- Click any visible text and edit it inline.
- Move and resize images.
- Save as a new PDF (download or push back into the workbench).

### 1.2 New capabilities v2 must provide

The user's stated must-haves and explicit gaps in v1:

1. **Text colour picker.** Selecting a run shows a colour swatch in the
   floating toolbar; changing it updates the on-page colour live.
2. **Font family picker.** A dropdown of (a) every font already embedded in
   the source PDF, plus (b) a small bundled set (Liberation Sans, Liberation
   Serif, Liberation Mono, DejaVu Sans) the editor always knows how to embed.
3. **Font size control.** Numeric input + up/down stepper, plus quick
   presets.
4. **Bold / italic toggles** when the chosen font family has those variants.
5. **Undo / redo** with full history of edits in the current session.
   Ctrl+Z / Ctrl+Y bindings. Reset clears history and reverts.
6. **No network round-trip per edit.** Save is a single client-side PDF
   regeneration; uploads only when the user explicitly clicks "Save to
   workbench" with a server-backed workspace.
7. **Add new text box.** Click an empty area, drag a rectangle, type. Treated
   as a new text object with default font / size / colour.
8. **Delete text run.** Select + Delete key, or context-menu Delete.
9. **Multi-select** runs and apply colour / font / size to all at once.

### 1.3 Performance targets

- Open and render the first page of a 100-page PDF in < 1.5 s on a mid-range
  laptop (Lenovo X1, Chrome).
- Per-keystroke latency under 16 ms (one frame) for documents up to 500 pages.
- Memory footprint < 4x the source PDF size on disk.
- Save (PDF -> downloaded blob) on a 50-page document under 2 s.

### 1.4 Reliability

- Round-trip an unchanged PDF and produce a byte-similar result (PDFium
  rewrites the structure, so byte-equal isn't realistic; but the visual diff
  should be zero outside areas the user edited).
- Recover gracefully from unsupported PDFs (encrypted, malformed) with a
  clear error.

### 1.5 Out of scope for v2

These stay where they are - the text editor doesn't grow to cover them:

- Annotation editing - the existing Annotate tool owns it.
- Form field editing - the existing FormFill / EditFormFields tool owns it.
- Digital signatures - the existing Sign tool owns it.
- Page reordering, splitting, merging - those are their own tools.
- Backend-driven find-and-replace via regex - `EditTextController` keeps that.

---

## 2. Code spec - architecture

### 2.1 Principles

- **Browser-canonical.** The user's edits live in client-side state. The
  server has no notion of an "editing session". No JSON round-trip.
- **PDFium-native.** PDFium owns the document model. We do not maintain a
  separate JSON mirror.
- **Small classes, one job each.** No file exceeds 400 LOC. Where one would,
  it gets split.
- **Hook-thin, class-fat.** Domain logic lives in plain TypeScript classes
  (testable without React). React components are thin views over those
  classes.
- **Disposable instances.** Every class that holds PDFium pointers exposes a
  `dispose()` that frees them. The React root calls dispose on unmount.
- **Old editor stays.** v2 ships next to v1 behind a query-param /
  feature-flag toggle. We do not delete v1 until v2 is the default and a
  release has passed.

### 2.2 Directory layout

```
frontend/editor/src/core/tools/pdfTextEditor/v2/
  index.ts                       # public exports
  PdfTextEditorV2.tsx            # React entry point (<300 LOC)
  components/
    Toolbar.tsx                  # font, size, colour, bold, italic, undo/redo
    PageStage.tsx                # the visible pages stack
    PageView.tsx                 # one page: bitmap layer + overlay layer
    TextRunOverlay.tsx           # editable HTML for a single text run
    ImageHandle.tsx              # react-rnd wrapper for an image
    NewTextDraft.tsx             # in-progress drag-to-create text box
    Sidebar.tsx                  # font picker, layer list, properties panel
    EmptyState.tsx               # dropzone before a doc is loaded
  model/
    EditorDocument.ts            # owns the PDFium document pointer
    Page.ts                      # one page; lazily loads its objects
    TextRun.ts                   # one text object (id, position, content,
                                 # font ref, colour, baseline, advance widths)
    ImageObject.ts               # one image object
    FontRef.ts                   # font handle + cached metrics
    Color.ts                     # rgb(a) value type
  store/
    EditorStore.ts               # zustand-style observable store (state +
                                 # subscriptions); holds selection,
                                 # pending edits, viewport, dirty pages
    HistoryStack.ts              # undo / redo
    Selection.ts                 # current selection (text run ids, caret)
  commands/
    Command.ts                   # interface: apply(doc), revert(doc)
    EditTextCommand.ts
    SetColourCommand.ts
    SetFontCommand.ts
    SetFontSizeCommand.ts
    MoveImageCommand.ts
    InsertTextCommand.ts
    DeleteObjectCommand.ts
    CompositeCommand.ts          # multi-object edits (multi-select)
  pdfium/
    PdfiumTextReader.ts          # FPDFPage_CountObjects walk -> TextRun[]
    PdfiumTextWriter.ts          # apply TextRun mutation back to PDFium
    PdfiumFontLoader.ts          # FPDFText_LoadFont + bundled webfonts
    PdfiumPageRenderer.ts        # render page bitmap (cached, debounced)
    PdfiumSave.ts                # PDFiumExt_SaveAsCopy -> Uint8Array
  fonts/
    BundledFonts.ts              # registry of always-available fonts
    FontDescriptor.ts            # name, style, weight, data accessor
    fontFiles/                   # web font files we may embed
  hooks/
    useEditorDocument.ts
    useSelection.ts
    useHistory.ts
    useToolbarState.ts
  types.ts                       # shared TS types (no model classes here)
  __tests__/                     # unit tests (vitest)
```

### 2.3 Class responsibilities

| Class | Responsibility | LOC budget |
| --- | --- | ---: |
| `EditorDocument` | Holds `docPtr`. Owns the page cache. Disposes on close. | 150 |
| `Page` | Holds `pagePtr`. Lazily reads objects via `PdfiumTextReader`. Tracks dirty bit. Re-renders bitmap on demand. | 250 |
| `TextRun` | Pure data: id, page, bounds, content, fontRef, size, fill colour, baseline. Mutation goes via a command, never direct. | 100 |
| `ImageObject` | Same shape, for images. | 80 |
| `FontRef` | Wraps a PDFium font pointer. Exposes `hasGlyph(code)`, `glyphWidth(code)`, `family`, `style`, `weight`. | 120 |
| `Color` | `{r,g,b,a}` value type + parser / formatter. | 60 |
| `EditorStore` | Observable state: doc, selection, dirty pages, history pointer. Subscribers are React components. | 200 |
| `HistoryStack` | LIFO of executed commands + redo stack. | 150 |
| `Selection` | Which run(s) are selected; caret position within a single-run selection. | 100 |
| `Command` impls | One file each. Each implements `apply(doc)` + `revert(doc)`. | 80 each |
| `PdfiumTextReader` | `extractTextRuns(page): TextRun[]`. | 250 |
| `PdfiumTextWriter` | `commitRunEdit(run)`. Generates content after mutation. | 200 |
| `PdfiumFontLoader` | Maps a bundled font descriptor to a `FontRef` inside the doc. | 250 |
| `PdfiumPageRenderer` | Returns a Bitmap for a page at a scale. Debounces re-renders. | 200 |
| `PdfiumSave` | `serialize(doc): Uint8Array`. | 80 |

### 2.4 Data flow

```
load:
  user file -> EditorDocument.open(bytes)
            -> for each page on demand: Page.ensureObjects()
                                          PdfiumTextReader.extractTextRuns()
            -> EditorStore.setDocument()

edit:
  user types -> TextRunOverlay onInput
             -> EditCommand created
             -> EditorStore.dispatch(cmd)
                  -> HistoryStack.push(cmd)
                  -> cmd.apply(doc) -> PdfiumTextWriter.commitRunEdit()
                  -> EditorStore notifies subscribers
             -> PageView re-renders bitmap + overlay

save:
  user clicks Save -> PdfiumSave.serialize(doc) -> Uint8Array
                   -> downloadBlob() or workbench.replaceActive()
```

### 2.5 Backend changes

- **Add**: `POST /api/v1/convert/pdf/text-editor/embed-font` - given a font
  family name and a UTF-8 string of needed glyphs, returns a TTF/OTF subset
  the frontend can pass to `FPDFText_LoadFont`. **Only used as a fallback for
  fonts the frontend doesn't bundle.** If we ship a sensible bundled set, this
  endpoint can be deferred until proven necessary.
- **Keep**: `EditTextController` (`/api/v1/general/edit-text`) - it's a
  separate find/replace tool, unrelated.
- **Deprecate**: `ConvertPdfJsonController` - mark its endpoints
  `@Deprecated` once v2 is the default. Delete after one release.
- **Keep**: `PdfJsonConversionService` - read-only access is still useful for
  `EditTextController` and for users on browsers that can't run WASM. Reduce
  the surface to "convert to JSON for read-only access".

### 2.6 Feature flag and rollout

- Query-param toggle: `?editor=v2` on `/pdf-text-editor` mounts the v2
  component. Default stays on v1.
- Once v2 passes all Playwright regressions + manual testing, the default
  flips. Old code stays in the tree for one release, then is removed.
- Memory: we open v2 lazily so users on v1 don't pay the PDFium init cost.

### 2.7 Tests

- Vitest unit tests for: `HistoryStack`, every `Command`, `Color` parsing,
  `Selection` invariants, `PdfiumTextReader` against a fixture PDF.
- Playwright stubbed spec: backend-free end-to-end - load fixture PDF, edit,
  colour, font, undo, save, reopen. Lives under
  `frontend/editor/src/core/tests/stubbed/pdf-text-editor-v2.spec.ts`.
- Playwright live spec covering the optional font-embed endpoint, only if we
  add it.
- Visual regression: render the original page bitmap and the post-save page
  bitmap for areas the user did NOT touch, expect zero pixel diff.

### 2.8 PDFium-imposed design constraints

Validated against PDFium `public/fpdf_edit.h` / `fpdf_text.h` and EmbedPDF's
wrapper:

- **No automatic layout.** `FPDFText_SetText` on an existing text object
  replaces its string but does not re-layout. Width is our problem.
  `PdfiumTextWriter` will:
  1. Compute the new advance width via `FPDFFont_GetGlyphWidth` per glyph.
  2. If the new width is greater than the original run's bounds, choose:
     a. shrink font size proportionally (if within ±20% of original); else
     b. split into multiple text objects on a wrap boundary; else
     c. mark the run "overflowing" in the UI and let the user decide.
- **No mutation of subset fonts.** If the user types a character not present
  in a run's existing (subset) font, we swap the run's font to a bundled
  fully-embedded font. The original font handle stays on every untouched run.
  `PdfiumFontLoader.ensureFontFor(run, newText)` performs the swap.
- **`FPDFPage_GenerateContent` after every mutation.** `Page.commit()` calls
  it. `PdfiumSave.serialize()` calls it again per dirty page before
  `PDFiumExt_SaveAsCopy`, as a belt-and-braces guard.
- **Font handle lifetimes.** `FPDFTextObj_GetFont` returns a borrowed handle -
  never closed. `FPDFText_LoadFont` returns an owned handle - closed in
  `EditorDocument.dispose()`. `FontRef` carries an `owned` flag.
- **Per-char to per-object back-map.** PDFium doesn't link `FPDFText_*` char
  indices back to the `FPDF_PAGEOBJECT`. `PdfiumTextReader` builds the map
  itself by intersecting each char's origin / box with each text object's
  bounds. The map is cached per page.
- **Custom font creation.** Use `FPDFPageObj_CreateTextObj(doc, font, size)`
  for runs that use a bundled font; `FPDFPageObj_NewTextObj(doc, name, size)`
  only works for the base-14 standard names.
- **Save path.** `PDFiumExt_OpenFileWriter` -> `PDFiumExt_SaveAsCopy` ->
  `PDFiumExt_GetFileWriterSize` -> `PDFiumExt_GetFileWriterData` ->
  `PDFiumExt_CloseFileWriter`. This is already the pattern in
  `pdfiumService.ts:saveRawDocument`.

### 2.9 Bundled fonts

Shipped under `v2/fonts/fontFiles/` and registered in `BundledFonts.ts`:

| Family | Files | Why |
| --- | --- | --- |
| Liberation Sans | Regular, Bold, Italic, BoldItalic | Metric-compatible with Arial; safe fallback for sans-serif. |
| Liberation Serif | Regular, Bold, Italic, BoldItalic | Metric-compatible with Times New Roman. |
| Liberation Mono | Regular, Bold | Metric-compatible with Courier New. |
| DejaVu Sans | Regular | Broad Unicode coverage when the others fall short. |

All Liberation fonts are SIL OFL 1.1; DejaVu is public domain / free. Both are
already used by the backend `PdfJsonFallbackFontService`, so the licensing
story is unchanged.

### 2.10 Definition of done

The v2 tool is **"done"** when all of the following hold for the fixture PDFs in
`frontend/editor/public/sampleFiles/`:

- All v1 capabilities work in v2.
- All new capabilities in section 1.2 work end-to-end.
- All Playwright specs in `pdf-text-editor-v2.spec.ts` pass on Chromium and
  WebKit.
- `task frontend:check` passes (typecheck + lint + tests).
- A 100-page PDF opens in < 1.5 s and saves in < 2 s on a developer laptop.
- No single source file in `v2/` exceeds 400 LOC.
- The user signs off.
