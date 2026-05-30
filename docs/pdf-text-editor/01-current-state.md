# PDF Text Editor - current state (as of 2026-05-30)

This document describes how the existing PDF text editor works today, from the
user's seat and from the code. It is the baseline the v2 rewrite is measured
against.

---

## 1. User spec - what the editor does today

### 1.1 Entry and load

1. User navigates to `/pdf-text-editor` (tool id `pdfTextEditor`).
2. User uploads a PDF via the dropzone, or the tool auto-loads the file already
   selected in the workbench.
3. The frontend sends the PDF to `POST /api/v1/convert/pdf/text-editor?async=true&lightweight=true`.
   The backend returns a `jobId` and begins parsing the PDF on a worker thread.
4. While the job runs, the editor shows a determinate progress bar with stages
   (parse pages, extract fonts, build JSON). For documents above the cache
   threshold the response is "lightweight" - text and metadata only, images are
   loaded later per-page on demand.
5. On completion the frontend `GET /api/v1/general/job/{jobId}/result` and
   parses a `PdfJsonDocument`: pages, fonts (as base64 web font blobs), text
   elements (with positions, font ids, sizes, optional colour data), images.

### 1.2 Editing

Once loaded, the user can:

- **Edit text**: click into a text "group" (a contiguous block the frontend has
  clustered from raw runs). The group becomes a contenteditable HTML element
  laid over the page preview. Typing updates the local state immediately.
- **Group / ungroup**: the sidebar offers Auto, Paragraph, Single-line grouping
  modes. The frontend re-clusters runs into groups; in paragraph mode multiple
  visual lines are merged into one editable block. Users can also manually
  merge selected groups or ungroup a paragraph.
- **Move / resize images**: each extracted image is wrapped in a `react-rnd`
  draggable handle. The user can drag and resize, the transform matrix is
  updated.
- **Reset**: per-image reset, or full-document reset to the originally-loaded
  JSON snapshot.

What the user **cannot** do today:

- Change text colour. The backend captures `fillColor` / `strokeColor` on every
  run, but the editor UI has no colour picker; colour comes through as
  read-only.
- Change font family or size. The current UI surfaces font status (whether the
  glyph subset has the character, whether a fallback was used) but does not let
  the user pick a different font.
- Add new text runs from scratch. Only existing runs can be edited.
- Add or replace images.
- Undo / redo. There is one global "reset" only.
- Edit form fields, annotations, or links from this tool (a different tool
  owns each).

### 1.3 Save and export

The user has four save paths from the sidebar:

1. **Download JSON** - downloads the in-memory `PdfJsonDocument` for offline
   inspection.
2. **Generate PDF** - sends edits back to the backend and downloads the
   rebuilt PDF.
3. **Save to Workbench** - same as Generate PDF, but the resulting file is
   pushed into the FileContext as the active document instead of downloaded.
4. **Generate PDF for navigation** - same as Save to Workbench, used when the
   user navigates to another tool while edits are pending.

For (2) (3) and (4) the frontend tries the incremental path first:

- `POST /api/v1/convert/pdf/text-editor/partial/{jobId}` with **only the
  pages that changed**. The backend reads the cached original PDF for the job
  and rewrites those pages in place using token-level content-stream
  surgery.
- If the cached job has expired, the frontend falls back to
  `POST /api/v1/convert/text-editor/pdf` and uploads the **entire**
  `PdfJsonDocument` as a JSON file.

### 1.4 Known user-visible issues

- **Memory pressure on large docs**: pdf.js renders every page to a canvas to
  build the preview, then masks out text and images. Large documents (~100+
  pages) cause the tab to spike RAM into the GB range.
- **No colour editing**: cited by the user as the main pain point.
- **Slow round-trips**: every "generate PDF" hits the backend; users on slow
  links see a noticeable wait.
- **Font fidelity drift**: when the source PDF uses a subset font (only the
  glyphs originally needed are embedded), typed characters that aren't in the
  subset fall back to a substitute font. The UI warns but cannot recover.
- **No undo**: a stray edit costs a full reset.

---

## 2. Code spec - how it works in the source

### 2.1 Topology

The text editor is a backend-heavy, server-canonical design: the canonical
representation of the document while editing lives in JSON, the backend owns
the round-trip, the frontend is essentially a JSON editor with preview.

```
       PDF ─► [Backend] PdfJsonConversionService ─► JSON ─► [Frontend]
                  PDFBox parse                                  React UI
                  Token rewrite                                  pdf.js preview
       PDF ◄── [Backend] PdfJsonConversionService ◄── JSON ◄────┘
```

### 2.2 Backend

| File | LOC | Role |
| --- | ---: | --- |
| `app/core/src/main/java/stirling/software/SPDF/service/PdfJsonConversionService.java` | 6,958 | The everything-class. PDF parse, font normalisation, glyph extraction, content-stream token rewrite, JSON serialisation, incremental update, job cache. |
| `app/core/src/main/java/stirling/software/SPDF/controller/api/converters/ConvertPdfJsonController.java` | 515 | REST endpoints for the PDF/JSON round-trip and incremental edit. |
| `app/core/src/main/java/stirling/software/SPDF/controller/api/EditTextController.java` | 337 | A separate, simpler **find/replace** endpoint (`/api/v1/general/edit-text`) - not what the React tool uses. |
| `app/core/src/main/java/stirling/software/SPDF/service/pdfjson/PdfJsonFontService.java` | ~700 | Font resolution and embedded font extraction. |
| `app/core/src/main/java/stirling/software/SPDF/service/PdfJsonFallbackFontService.java` | ~400 | Backend-side fallback font catalogue. |
| `app/core/src/main/java/stirling/software/SPDF/service/pdfjson/type3/Type3FontConversionService.java` | ~500 | Special-case Type 3 (custom-glyph) font handling. |
| `app/core/src/main/java/stirling/software/SPDF/service/pdfjson/type3/Type3GlyphExtractor.java` | ~400 | Vectorises Type 3 glyphs so the browser can render them. |
| `app/common/src/main/java/stirling/software/common/util/PdfTextLocator.java` | 139 | Reusable text-position locator (used by EditTextController). |

Endpoints owned by the editor:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/convert/pdf/text-editor` | Parse PDF, return JSON (sync or async via `?async=true`). |
| `POST` | `/api/v1/convert/text-editor/pdf` | Rebuild a PDF from a full JSON document. |
| `POST` | `/api/v1/convert/pdf/text-editor/metadata` | Lightweight metadata-only response that opens a job. |
| `POST` | `/api/v1/convert/pdf/text-editor/partial/{jobId}` | Apply edited pages on top of the cached original PDF. |
| `GET`  | `/api/v1/convert/pdf/text-editor/page/{jobId}/{pageNumber}` | Pull a single page's images on demand. |
| `GET`  | `/api/v1/convert/pdf/text-editor/fonts/{jobId}/{pageNumber}` | Pull a single page's font payloads on demand. |
| `POST` | `/api/v1/convert/pdf/text-editor/clear-cache/{jobId}` | Drop the cached job. |

`PdfJsonConversionService` is a single Spring `@Service` bean that owns:

- the in-memory job cache (`Caffeine`-style soft cache keyed by job id);
- one `ObjectMapper`;
- font normalisation helpers (Ghostscript shell-out, optional);
- the PDFBox `PDDocument`/`PDPage`/`PDResources`/`COSStream` walk;
- token rewriting (`PDFStreamParser` -> mutate token list -> `ContentStreamWriter`);
- Type 3 vectorisation;
- JSON model assembly.

Roughly half of the file is taken up by **token rewriting** for text-showing
operators (`Tj`, `TJ`, `'`, `"`). The implementation reconstructs a per-glyph
character-code map, swaps in replacement glyphs from the new text, then writes
the stream back. This is fragile: any code path that doesn't survive a round
trip surfaces as visible corruption.

### 2.3 Frontend

| File | LOC | Role |
| --- | ---: | --- |
| `frontend/editor/src/core/tools/pdfTextEditor/PdfTextEditor.tsx` | 2,049 | Tool component. Owns load, conversion job, lazy page/font loading, edit state, save orchestration. |
| `frontend/editor/src/core/tools/pdfTextEditor/pdfTextEditorUtils.ts` | ~600 | Pure helpers: text grouping, deep clone, image extraction, glyph restoration. |
| `frontend/editor/src/core/tools/pdfTextEditor/pdfTextEditorTypes.ts` | 233 | TypeScript mirror of the backend JSON model. |
| `frontend/editor/src/core/tools/pdfTextEditor/fontAnalysis.ts` | 523 | Font fidelity analysis (subset coverage, fallback warnings). |
| `frontend/editor/src/core/components/tools/pdfTextEditor/PdfTextEditorView.tsx` | 2,897 | Renders the page, overlays editable groups, manages caret, drives `react-rnd` for images, generates page previews via pdf.js. |
| `frontend/editor/src/core/components/tools/pdfTextEditor/PdfTextEditorSidebar.tsx` | 426 | Side controls (grouping mode, action buttons, font status). |
| `frontend/editor/src/core/components/tools/pdfTextEditor/FontStatusPanel.tsx` | ~150 | Subset-coverage status UI. |

A few specific pain points in the frontend that motivate the rewrite:

- `PdfTextEditor.tsx` is a single 2k-LOC component holding load, conversion,
  caching, edit, and save logic. It uses `useRef` heavily as a shadow state
  store and is hard to follow.
- Page previews are produced by rendering the full PDF page via pdf.js into a
  canvas, then erasing text and image regions with `globalCompositeOperation =
  "destination-out"` so the editor's HTML overlay can paint them. Every page
  has its own canvas; nothing is shared across pages.
- Editing is captured via `contenteditable` divs, with a custom
  `extractTextWithSoftBreaks` that runs `range.getClientRects()` per character
  to recover line breaks. This is O(n) per keystroke per group.
- Every save sends the JSON over the wire; the incremental path is best-effort
  and silently falls back to the full upload when the backend cache has
  expired.

### 2.4 Tests

- No Playwright spec exists for the text editor specifically. It appears in the
  `all-tool-pages-load.spec.ts` smoke list but only as "page loads without
  crashing".
- Backend unit tests cover `EditTextController` find/replace and Type 3 font
  conversion, not the React tool's round-trip.

### 2.5 Already-present client-side primitives the rewrite can use

The frontend already ships PDFium WASM and a non-trivial wrapper layer used by
other tools:

| File | Purpose |
| --- | --- |
| `frontend/editor/src/core/services/pdfiumService.ts` (1,934 LOC) | Singleton PDFium engine. Wraps document open/close/save, form fields, signatures, link extraction, page rendering, metadata. |
| `frontend/editor/src/core/services/pdfiumDocBuilder.ts` | Pdf-lib-compatible `PdfiumPage` with `drawText`, `drawRectangle`, `drawLine`, `drawImage`. Already uses `FPDFPageObj_NewTextObj`, `FPDFText_SetText`, `FPDFPageObj_SetFillColor`, `FPDFPageObj_Transform`. |
| `frontend/editor/src/core/utils/pdfiumPageRender.ts` | `renderPdfiumPageDataUrl`, `readPdfiumPageMetadata`. |
| `frontend/editor/src/core/utils/pdfiumBitmapUtils.ts` | Bitmap helpers used by `drawImage`. |
| `frontend/editor/src/core/utils/pdfLinkUtils.ts` | Migrated from pdf-lib to PDFium - a worked precedent for "move feature off backend onto PDFium". |
| `frontend/editor/src/core/utils/signatureFlattening.ts` | Uses PDFium to read, render, and flatten signature annotations in the browser. |
| `frontend/editor/src/core/components/viewer/LocalEmbedPDF.tsx` and `LocalEmbedPDFWithAnnotations.tsx` | EmbedPDF viewer wired to the local PDFium instance. |

Package deps relevant to the rewrite (already installed, no new dependencies
needed):

- `@embedpdf/pdfium` (PDFium WASM)
- `@embedpdf/engines`, plus EmbedPDF render/selection/history/redaction/annotation plugins
- `@cantoo/pdf-lib` (fork of pdf-lib that handles more font cases)
- `pdfjs-dist` (already used elsewhere)

### 2.6 What the backend would still be needed for, if anything

Walking the existing primitives against the user's "do as much frontend as
possible" goal:

| Capability | Available client-side today? | Notes |
| --- | --- | --- |
| Open / parse PDF | Yes (PDFium) | Already in production. |
| Enumerate text objects with position, font, colour | Yes (PDFium `FPDFPage_CountObjects`, `FPDFPageObj_GetType`, `FPDFTextObj_GetText`, `FPDFPageObj_GetFillColor`, `FPDFPageObj_GetMatrix`) | Wrappers exist for the write side; read side needs ~150 LOC of additional wrappers. |
| Mutate text object content | Yes (`FPDFText_SetText`) | Already used by `pdfiumDocBuilder.ts`. |
| Set colour | Yes (`FPDFPageObj_SetFillColor`) | Already used. |
| Save PDF | Yes (`PDFiumExt_SaveAsCopy`) | Already used. |
| Render page for preview | Yes (PDFium or pdf.js) | Already used. |
| Font subset embedding for newly-typed characters | Partially | PDFium uses the page's existing fonts; for new characters not in any embedded subset we either bundle a fallback web font (Liberation Sans / Serif / Mono) and embed it lazily, or call the backend once to embed a subset. |

The cleanest split is: **everything except font-subset embedding for new
characters lives in the browser; backend retains only an optional `POST
/api/v1/convert/pdf/text-editor/embed-font` endpoint that, given a font
identifier and a glyph set, returns a fresh embeddable subset.** If we ship a
small set of well-known web fonts with the editor, even that can be done
client-side.
