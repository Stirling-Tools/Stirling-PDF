import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { writeUtf16 } from "@app/services/pdfiumService";
import { collectMemberPtrs } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

// Narrowest base-14 glyph ("i") is ~0.22em, so ink well under ~0.15em per
// visible char means the font produced .notdef / zero-width filler.
const MIN_INK_EM_PER_CHAR = 0.15;

/** Pushes `TextRun` mutations into PDFium. */
export class PdfiumTextWriter {
  /**
   * Set the run's text on its existing PDFium object.
   *
   * Returns false when the object's font could not actually encode the text.
   * `FPDFText_SetText` re-encodes from Unicode and silently substitutes filler
   * charcodes for anything the font cannot map - on a Type 3 or symbolically
   * encoded subset that yields blank, zero-advance glyphs. The caller must
   * treat false as "this fast path is unusable" and re-emit through the
   * validated overlay path instead of shipping the corrupted object.
   */
  static commitRunText(doc: EditorDocument, page: Page, run: TextRun): boolean {
    if (!run.pdfiumObjPtr) return false;
    const m = doc.module;
    const ptr = writeUtf16(m, run.text);
    try {
      m.FPDFText_SetText(run.pdfiumObjPtr, ptr);
    } finally {
      m.pdfium.wasmExports.free(ptr);
    }
    // Defer the regen: FPDFPageObj_GetBounds reads the object, not the
    // stream, and a direct call here would skip the page's regenerated flag.
    page.markNeedsGenerate();
    // Re-measure the run's bounds. Stale width corrupts all of those.
    const bbox = measureObjBboxPt(m, run.pdfiumObjPtr);
    if (!bbox) {
      // Can't measure, so can't disprove the write; keep the old behaviour.
      return true;
    }
    const width = Math.max(0, bbox.right - bbox.left);
    const visible = run.text.replace(/\s+/gu, "").length;
    const fontSize = run.fontSize > 0 ? run.fontSize : 0;
    if (visible > 0 && fontSize > 0) {
      if (width < visible * fontSize * MIN_INK_EM_PER_CHAR) {
        // Leave `run.bounds` alone: the collapsed box is not real geometry.
        return false;
      }
    }
    run.bounds = { ...run.bounds, x: bbox.left, width };
    return true;
  }

  static commitRunFill(doc: EditorDocument, page: Page, run: TextRun): void {
    const m = doc.module;
    // Recolour EVERY sub-object.
    const ptrs = collectMemberPtrs(run);
    if (ptrs.every((p) => !p)) return;
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

/** Read the visible-bbox of a text object in PDF points. */
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
