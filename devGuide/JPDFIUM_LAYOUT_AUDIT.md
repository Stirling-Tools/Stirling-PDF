# JPDFium Layout Branch Audit

Branch: `feat/jpdfium-layout` (commit `eb2c18325`) vs `origin/feat/jpdfium-integration`.

## What the branch actually changes

Diff is a single commit. Production code: ~50 lines added across 4 controllers. No PDFBox logic removed. Every change is the same pattern:

```java
if (file != null) {
    try (PdfDocument ignored = PdfDocument.open(file.getBytes())) {
    } catch (Exception e) {
        log.debug("JPDFium pre-validate failed; proceeding with PDFBox: {}", e.getMessage());
    }
}
// then the existing PDDocument-based layout runs unchanged
```

Tests added: `PosterPdfControllerTest`, `ToSinglePageControllerTest` (both mock `CustomPDFDocumentFactory`; they do not exercise the JPDFium probe at all). No tests added for `BookletImpositionController` or `MultiPageLayoutController`.

## Cost of the probe per request

`MultipartFile.getBytes()` materializes the full upload as a Java `byte[]` (one full heap copy of the PDF). `PdfDocument.open(byte[])` then `Arena.allocateFrom(JAVA_BYTE, data)` copies that buffer into a confined native arena (second copy), and the native `jpdfium_doc_open_bytes` bridge copies it again into PDFium's internal heap before parsing (third copy). PDFium then parses the xref, builds its object cache, and we immediately `close()` and discard everything.

The subsequent PDFBox `pdfDocumentFactory.load(file)` calls `file.getBytes()` again (fourth full materialization) and re-parses from scratch. **Nothing is reused.**

## Per-controller analysis

### ToSinglePageController
- Probe saves work on bad input? No - the catch swallows the failure and PDFBox runs anyway.
- Adds latency? Yes - full doc parse + 3 buffer copies + GC pressure on every happy-path request.
- Reduces peak heap? No - increases it: extra `byte[]` + native arena + PDFium object cache held until `close()`.
- Real migration blocker: `PdfLongImage` returns a `BufferedImage` only. No PDF page emit, no vector-preserving stitch via form XObjects.

### MultiPageLayoutController
- Probe saves work? No (catch-swallow).
- Adds latency? Yes.
- Reduces heap? No.
- Migration blockers: `NUpLayout` builder exposes only `grid(cols, rows)` and `pageSize(w, h)`. Missing: outer/inner margins, borders, `BY_COLUMNS` arrangement, RTL reading direction, form-field copy/transform, blank-page padding, A4-fixed paper rule, configurable orientation toggle.

### BookletImpositionController
- Probe saves work? No (catch-swallow).
- Adds latency? Yes.
- Reduces heap? No.
- Migration blockers: `PdfPrint.booklet` `BookletOptions` exposes only `sheetSize`, `binding` (`LEFT|RIGHT`), `creepCompensation`. Missing: gutter size, duplex pass selection (`BOTH|FIRST|SECOND`), short-edge flip, border, derive paper from source CropBox, per-page rotation handling.

### PosterPdfController
- Probe saves work? No (catch-swallow).
- Adds latency? Yes.
- Reduces heap? No.
- Migration blockers: `PdfPosterizer.posterize` edits the doc in place by cropping MediaBox/CropBox to tile rects. Does not scale tiles onto a target paper rectangle (A4/Letter/A3/A5/Legal/Tabloid output), does not produce a ZIP of one PDF per input, no RTL column ordering, no per-input filename templating.

## Upstream feature requests (JPDFium 1.0.2)

One line each, suitable to drop into the JPDFium issue tracker:

1. `NUpLayout`: support outer/inner margins, optional cell border (width + colour), `BY_COLUMNS` arrangement, and RTL column ordering.
2. `NUpLayout`: form-field copy/transform when tiling pages that contain AcroForm fields.
3. `PdfPrint.booklet`: gutter (mm/pt), duplex-pass selector (`BOTH|FRONT|BACK`), short-edge flip, border, derive sheet size from source CropBox.
4. `PdfPrint.booklet`: preserve per-page rotation when placing into cells.
5. `PdfPosterizer`: emit a new document with tiles scaled onto a configurable target paper size rather than mutating MediaBox/CropBox in place.
6. `PdfPosterizer`: RTL column ordering and a deterministic tile-order callback.
7. `PdfLongImage`: PDF emit mode that stitches pages as a single tall PDF page using `FPDF_ImportPages` + transforms (vector-preserving), not just a `BufferedImage`.
8. `PdfDocument.open(byte[])`: cheap "validate-only" entry point that parses headers/xref without building the full page cache, so callers can probe inputs without paying full-parse cost.

## Verdict

| Controller | Verdict | Reason |
|---|---|---|
| ToSinglePageController | DROP | Probe is pure overhead; no JPDFium PDF-emit path exists |
| MultiPageLayoutController | DROP | Probe is pure overhead; NUpLayout missing 6 features |
| BookletImpositionController | DROP | Probe is pure overhead; booklet missing 5 features |
| PosterPdfController | DROP | Probe is pure overhead; posterizer wrong shape |

## Bottom line

The branch is a no-op migration: it adds a full-parse-and-throw on every request without removing any PDFBox work, and the catch-swallow means it does not even short-circuit bad inputs. **Do not merge as-is.** Defer until JPDFium 1.0.2 lands features 1-7 above, and add feature 8 to make cheap validation viable. At that point a real migration can replace PDFBox in these controllers instead of running alongside it.
