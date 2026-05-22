# Audit: feat/jpdfium-overlay

Verifies whether merging `feat/jpdfium-overlay` over `feat/jpdfium-integration` actually wins anything.

## What the branch actually does

Sole code commit: `fbadcda74 impl migration to pdfium for overlay and watermark and pagenumbers`. Net diff vs `feat/jpdfium-integration` is 5 files, +212 / -2.

For each of the three controllers the change is identical in shape:

```java
// JPDFium pre-validate catches corrupt PDFs cheaply before PDFBox does ...
try (PdfDocument ignored = PdfDocument.open(pdfFile.getBytes())) {
} catch (Exception e) {
    log.debug("JPDFium pre-validate failed; proceeding with PDFBox: {}", e.getMessage());
}

try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
    // ... all real overlay work done by PDFBox, exactly as before
}
```

There is no JPDFium overlay being performed. PDFBox still does 100% of:
- watermark tiled overlay (rows x cols, rotated, with non-Latin TTFs)
- 9-position page numbers with `{n}` / `{total}` / `{filename}` templating
- multi-line rotated stamps with rich `@var` templating

## Does the probe earn its keep?

No, on three counts:

1. **It does not short-circuit.** Catch swallows everything to DEBUG and falls through to PDFBox. A corrupt PDF still hits the full PDFBox parse path. The probe only adds work; it never saves any.
2. **It costs more than it saves on the hot path.** `PdfDocument.open(byte[])` does `MultipartFile.getBytes()` (full heap copy) + `JpdfiumLib.docOpenBytes` which `Arena.allocateFrom(JAVA_BYTE, data)` copies the entire payload into native memory, parses xref, then frees. For files > 10 MB `CustomPDFDocumentFactory.load(MultipartFile)` is normally stream-to-temp; the probe forces a full byte[] read in addition. Net: one extra heap-sized copy, one native copy, one PDFium parse, all discarded.
3. **No new corrupt-input test exercises the path.** `WatermarkControllerTest.OracleTests` and `PageNumbersControllerTest` only assert structure preservation on valid input. Probe is dead instrumentation as committed.

## JPDFium 1.0.x feature gaps that blocked real migration

Confirmed against `release/1.0.1` of JPDFium-pub.

| # | Gap | Where | Blocks |
|---|-----|-------|--------|
| 1 | `WatermarkApplier` is single-placement only; no row x col tiling. | `WatermarkApplier.applyTextWatermark` / `applyImageWatermark` | WatermarkController tiled overlay |
| 2 | High-level `WatermarkApplier` / `HeaderFooterApplier` only accept the built-in `FontName` enum. `PdfPageEditor.loadFont(byte[], type, cid)` exists but is not plumbed through. | `WatermarkApplier` line 72, `HeaderFooterApplier` line 103 | Non-Latin scripts (Arabic, JP, KR, ZH, Thai) |
| 3 | `HeaderFooterApplier.apply` hard-codes `size.width() / 2f` for both header and footer x. No 9-position grid. | `HeaderFooterApplier.apply` lines 49-56 | PageNumbersController 1..9 layout |
| 4 | `expandTemplate` only knows `{page}`, `{pages}`, `{date}`. | `HeaderFooterApplier.expandTemplate` line 93 | PageNumbers `{filename}`, Stamp `@filename`/`@author`/`@title`/`@uuid`/`@date{fmt}` etc. |
| 5 | `PdfAnnotationBuilder` takes a single `contents` string and a `Rect`; no multi-line layout, no per-line newline split, no rotated text-object matrices on the page content stream. | `PdfAnnotationBuilder.build` lines 130-137 | StampController `addTextStamp` multi-line + rotation |
| 6 | No image stamp/watermark with explicit width/height + rotation matrix; `WatermarkApplier.applyImageWatermark` forces `targetW = pageW * 0.3f` and never rotates. | `WatermarkApplier` lines 113-136 | Stamp/Watermark image variants |

Each maps to a one-line upstream feature request below.

## Upstream feature requests for JPDFium 1.0.2

1. `WatermarkApplier`: add `tileRows`/`tileCols` plus `widthSpacer`/`heightSpacer` builder fields and emit a row x col grid in `applyToPage`.
2. `Watermark`/`HeaderFooter` builders: accept `byte[] ttfFontData` (forward to `PdfPageEditor.loadFont` + use the returned `FPDF_FONT` in `createTextObject`).
3. `HeaderFooterApplier`: add `Position` enum (9-grid) for header and footer independently; replace the hard-coded `width/2f` x with `WatermarkApplier.computePosition`.
4. `HeaderFooter.expandTemplate`: add `{filename}`, `{author}`, `{title}`, `{subject}`, `{uuid}`, `{date:format}` and an `@var` alias set.
5. `PdfAnnotationBuilder` (or a new `TextStampApplier`): accept `List<String> lines`, `float rotationDegrees`, line-height, and emit one transformed text object per line via `PdfPageEditor.createTextObject` + `transform`.
6. `WatermarkApplier.applyImageWatermark`: take explicit `(width, height, rotation)` instead of fixed 30% width with no rotation.

## VERDICT

| Controller | Verdict | Reason |
|------------|---------|--------|
| WatermarkController | DROP | Probe is pure tax. Real migration blocked by gaps 1 + 2. |
| PageNumbersController | DROP | Probe is pure tax. Real migration blocked by gaps 3 + 4. |
| StampController | DROP | Probe is pure tax. Real migration blocked by gaps 4 + 5 + 6. |

## Bottom line

Drop the branch. The probe is a no-op that adds a full byte-copy + native parse to every overlay request and never short-circuits. Re-attempt overlay migration once JPDFium 1.0.2 lands feature requests 1-6, at which point a real migration (not a probe) is feasible.
