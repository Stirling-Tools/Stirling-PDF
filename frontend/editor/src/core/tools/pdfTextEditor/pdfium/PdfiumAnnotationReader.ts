import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  type AnnotationBox,
  annotationKindFor,
} from "@app/tools/pdfTextEditor/model/AnnotationBox";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";

// The canvas renders with FPDF_ANNOT, but the editor model walks page objects
// only - so FreeText/widget/stamp text is visible and completely uneditable.
// Reading the boxes lets the UI outline them and say why.

interface AnnotModule {
  FPDFPage_GetAnnotCount?: (page: number) => number;
  FPDFPage_GetAnnot?: (page: number, index: number) => number;
  FPDFPage_CloseAnnot?: (annot: number) => void;
  FPDFAnnot_GetSubtype?: (annot: number) => number;
  FPDFAnnot_GetRect?: (annot: number, rect: number) => boolean;
  EPDFAnnot_GetRect?: (annot: number, rect: number) => boolean;
}

/** Hard cap so a pathological page can't stall the reader. */
const MAX_ANNOTS = 2000;

export class PdfiumAnnotationReader {
  static populate(m: WrappedPdfiumModule, page: Page): void {
    const mod = m as unknown as AnnotModule;
    if (
      !mod.FPDFPage_GetAnnotCount ||
      !mod.FPDFPage_GetAnnot ||
      !mod.FPDFAnnot_GetSubtype ||
      !mod.FPDFPage_CloseAnnot
    ) {
      page.setAnnotations([]);
      return;
    }
    const getRect = mod.EPDFAnnot_GetRect ?? mod.FPDFAnnot_GetRect;
    if (!getRect) {
      page.setAnnotations([]);
      return;
    }

    let count = 0;
    try {
      count = mod.FPDFPage_GetAnnotCount(page.pagePtr);
    } catch {
      page.setAnnotations([]);
      return;
    }

    const out: AnnotationBox[] = [];
    const rectBuf = m.pdfium.wasmExports.malloc(4 * 4);
    try {
      for (let i = 0; i < Math.min(count, MAX_ANNOTS); i++) {
        const annot = mod.FPDFPage_GetAnnot(page.pagePtr, i);
        if (!annot) continue;
        try {
          const kind = annotationKindFor(mod.FPDFAnnot_GetSubtype(annot));
          if (!kind) continue;
          if (!getRect(annot, rectBuf)) continue;
          const left = m.pdfium.getValue(rectBuf, "float");
          const top = m.pdfium.getValue(rectBuf + 4, "float");
          const right = m.pdfium.getValue(rectBuf + 8, "float");
          const bottom = m.pdfium.getValue(rectBuf + 12, "float");
          const x = Math.min(left, right);
          const y = Math.min(top, bottom);
          const width = Math.abs(right - left);
          const height = Math.abs(top - bottom);
          // Degenerate rects (hidden widgets) would draw a dot over the page.
          if (!(width > 1 && height > 1)) continue;
          if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(height)
          ) {
            continue;
          }
          out.push({
            id: `p${page.index}-annot-${i}`,
            kind,
            rect: { x, y, width, height },
          });
        } finally {
          mod.FPDFPage_CloseAnnot(annot);
        }
      }
    } finally {
      m.pdfium.wasmExports.free(rectBuf);
    }
    page.setAnnotations(out);
  }
}
