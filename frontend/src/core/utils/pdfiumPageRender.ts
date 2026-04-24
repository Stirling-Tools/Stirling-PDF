/**
 * pdfiumPageRender — render a single PDF page from an already-opened PDFium
 * document pointer to a canvas data URL.
 *
 * Shared by the first-page thumbnail path (thumbnailUtils.ts) and the
 * per-page thumbnail service (thumbnailGenerationService.ts) so the pixel-
 * copy + white-background logic lives in one place.
 */
import { getPdfiumModule } from "@app/services/pdfiumService";

/** FPDF_ANNOT (0x01) | FPDF_LCD_TEXT (0x10). */
const PDFIUM_RENDER_FLAGS = 0x01 | 0x10;

export interface RenderPdfiumPageOptions {
  /** When true (default), bake the page's own rotation into the bitmap.
   *  When false, render upright so callers can apply CSS rotation. */
  applyRotation?: boolean;
  /** Output format; defaults to PNG. */
  format?: "png" | "jpeg";
  /** JPEG quality [0,1]; ignored for PNG. */
  quality?: number;
}

/**
 * Render a single page (0-indexed) of an open PDFium document into a data URL.
 *
 * The caller is responsible for opening and closing the document pointer.
 */
export async function renderPdfiumPageDataUrl(
  docPtr: number,
  pageIndex: number,
  scale: number,
  options: RenderPdfiumPageOptions = {},
): Promise<string | null> {
  const { applyRotation = true, format = "png", quality } = options;
  const m = await getPdfiumModule();

  const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
  if (!pagePtr) return null;

  try {
    const rawW = m.FPDF_GetPageWidthF(pagePtr);
    const rawH = m.FPDF_GetPageHeightF(pagePtr);
    // FPDFPage_GetRotation returns 0..3 for 0°/90°/180°/270° CW.
    const pageRotQuarters = (m as any).FPDFPage_GetRotation(pagePtr) | 0;

    const isQuarterTurn = pageRotQuarters === 1 || pageRotQuarters === 3;
    const outW = applyRotation && isQuarterTurn ? rawH : rawW;
    const outH = applyRotation && isQuarterTurn ? rawW : rawH;
    const w = Math.max(1, Math.round(outW * scale));
    const h = Math.max(1, Math.round(outH * scale));

    const bitmapPtr = m.FPDFBitmap_Create(w, h, 1);
    try {
      // White background — PDF content doesn't encode paper colour, so
      // unpainted regions would otherwise be transparent.
      m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, w, h, 0xffffffff);
      m.FPDF_RenderPageBitmap(
        bitmapPtr,
        pagePtr,
        0,
        0,
        w,
        h,
        applyRotation ? pageRotQuarters : 0,
        PDFIUM_RENDER_FLAGS,
      );

      const bufferPtr = m.FPDFBitmap_GetBuffer(bitmapPtr);
      const stride = m.FPDFBitmap_GetStride(bitmapPtr);
      const heap = new Uint8Array((m.pdfium.wasmExports as any).memory.buffer);
      const pixels = new Uint8ClampedArray(w * h * 4);

      // BGRA → RGBA. Direct HEAPU8 indexing is ~100× faster than
      // per-pixel m.pdfium.getValue() calls for large bitmaps.
      for (let y = 0; y < h; y++) {
        const srcRow = bufferPtr + y * stride;
        const dstRow = y * w * 4;
        for (let x = 0; x < w; x++) {
          const so = srcRow + x * 4;
          const dst = dstRow + x * 4;
          pixels[dst] = heap[so + 2];
          pixels[dst + 1] = heap[so + 1];
          pixels[dst + 2] = heap[so];
          pixels[dst + 3] = heap[so + 3];
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.putImageData(new ImageData(pixels, w, h), 0, 0);
      return format === "jpeg"
        ? canvas.toDataURL("image/jpeg", quality ?? 0.8)
        : canvas.toDataURL();
    } finally {
      m.FPDFBitmap_Destroy(bitmapPtr);
    }
  } finally {
    m.FPDF_ClosePage(pagePtr);
  }
}

/**
 * Read raw width/height/rotation for a page without rendering.
 */
export async function readPdfiumPageMetadata(
  docPtr: number,
  pageIndex: number,
): Promise<{ width: number; height: number; rotation: number } | null> {
  const m = await getPdfiumModule();
  const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
  if (!pagePtr) return null;
  try {
    const width = m.FPDF_GetPageWidthF(pagePtr);
    const height = m.FPDF_GetPageHeightF(pagePtr);
    const rotation = (((m as any).FPDFPage_GetRotation(pagePtr) | 0) & 3) * 90;
    return { width, height, rotation };
  } finally {
    m.FPDF_ClosePage(pagePtr);
  }
}
