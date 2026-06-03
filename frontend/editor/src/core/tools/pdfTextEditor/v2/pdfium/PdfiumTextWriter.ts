import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { writeUtf16 } from "@app/services/pdfiumService";
import {
  collectMemberPtrs,
  preserveConsecutiveSpaces,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

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
    const ptr = writeUtf16(m, preserveConsecutiveSpaces(run.text));
    try {
      m.FPDFText_SetText(run.pdfiumObjPtr, ptr);
    } finally {
      m.pdfium.wasmExports.free(ptr);
    }
    page.markNeedsGenerate();
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

  static commitRunFontSize(
    doc: EditorDocument,
    page: Page,
    run: TextRun,
  ): void {
    // PDFium has no per-object SetFontSize. We instead scale the matrix.
    // For the v0 we re-apply the original matrix's translation while
    // replacing the scale with the requested size.
    if (!run.pdfiumObjPtr) return;
    const m = doc.module;
    const sx = run.fontSize / Math.max(1, run.matrix.a || 1);
    const sy = run.fontSize / Math.max(1, run.matrix.d || 1);
    m.FPDFPageObj_Transform(run.pdfiumObjPtr, sx, 0, 0, sy, 0, 0);
    run.matrix = {
      ...run.matrix,
      a: run.matrix.a * sx,
      d: run.matrix.d * sy,
    };
    page.markNeedsGenerate();
  }
}
