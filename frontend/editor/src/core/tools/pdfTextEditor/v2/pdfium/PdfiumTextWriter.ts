import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { writeUtf16 } from "@app/services/pdfiumService";
import { collectMemberPtrs } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

/**
 * Pushes `TextRun` mutations into PDFium.
 *
 * Every public method:
 *  1. Calls the appropriate `FPDF*` setter on the run's object pointer.
 *  2. Calls `FPDFPage_GenerateContent(page.pagePtr)` so the change is
 *     persisted when the document is saved or re-rendered.
 */
export class PdfiumTextWriter {
  static commitRunText(doc: EditorDocument, page: Page, run: TextRun): void {
    if (!run.pdfiumObjPtr) return;
    const m = doc.module;
    const ptr = writeUtf16(m, run.text);
    try {
      m.FPDFText_SetText(run.pdfiumObjPtr, ptr);
    } finally {
      m.pdfium.wasmExports.free(ptr);
    }
    m.FPDFPage_GenerateContent(page.pagePtr);
    // Re-measure the run's bounds. PDFium's text-object width depends on
    // the SetText payload (longer text = wider bbox), and without this
    // refresh the model's `bounds.width` stays at whatever the previous
    // emit produced. That's user-visible as:
    //   * the TextRunOverlay's selection/hover rectangle stays the OLD
    //     wider width after deleting trailing chars (esp. spaces). User
    //     reports "I deleted the spaces but the box still looks like
    //     they're there" because the overlay's CSS width is `pdfWidth`
    //     and pdfWidth = bounds.width * scale.
    //   * `bounds.width` is used by find-in-document highlighting,
    //     hit-testing, and the per-run advance-tracking in partialEdit.
    //     Stale width corrupts all of those.
    const bbox = measureObjBboxPt(m, run.pdfiumObjPtr);
    if (bbox) {
      run.bounds = {
        ...run.bounds,
        x: bbox.left,
        width: Math.max(0, bbox.right - bbox.left),
      };
    }
  }

  static commitRunFill(doc: EditorDocument, page: Page, run: TextRun): void {
    if (!run.pdfiumObjPtr) return;
    const m = doc.module;
    // Recolour EVERY sub-object - LineGrouper-merged runs and paragraphs
    // back the rep with many PDFium text objects, and FPDFPageObj_SetFillColor
    // operates per-object. Recolouring only the rep ptr left the rest of
    // the words / lines in the previous colour.
    const ptrs = collectMemberPtrs(run);
    const seen = new Set<number>();
    for (const ptr of ptrs) {
      if (!ptr || seen.has(ptr)) continue;
      seen.add(ptr);
      try {
        m.FPDFPageObj_SetFillColor(
          ptr,
          run.fill.r,
          run.fill.g,
          run.fill.b,
          run.fill.a,
        );
      } catch {
        /* best-effort - stale ptrs silently skipped */
      }
    }
    page.markNeedsGenerate();
  }
}

/**
 * Read the visible-bbox of a text object in PDF points. Returns null if
 * PDFium couldn't measure (off-page, deleted, no-glyph, etc.).
 */
function measureObjBboxPt(
  m: WrappedPdfiumModule,
  objPtr: number,
): { left: number; right: number } | null {
  const l = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const r = m.pdfium.wasmExports.malloc(4);
  const t = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetBounds(objPtr, l, b, r, t)) return null;
    return {
      left: m.pdfium.getValue(l, "float"),
      right: m.pdfium.getValue(r, "float"),
    };
  } finally {
    m.pdfium.wasmExports.free(l);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(t);
  }
}
