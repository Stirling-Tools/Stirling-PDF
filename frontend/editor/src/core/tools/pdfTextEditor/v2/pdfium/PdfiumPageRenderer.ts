import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";

/**
 * Renders pages to bitmaps for the on-screen preview.
 *
 * V0 just re-renders on demand; a future iteration will add a per-page
 * cache keyed by `(pageIndex, scale, version)` with LRU eviction and a
 * debounce.
 */
export class PdfiumPageRenderer {
  static async render(
    doc: EditorDocument,
    page: Page,
    scale: number,
  ): Promise<ImageData> {
    const m = doc.module;
    // Flush any deferred mutations so the bitmap reflects the current
    // edit state. Cheap no-op when nothing has changed.
    page.flushGenerate(m);
    const rawW = page.width;
    const rawH = page.height;
    const w = Math.max(1, Math.round(rawW * scale));
    const h = Math.max(1, Math.round(rawH * scale));

    // BGRA bitmap = format 1, fill white, then render with REVERSE_BYTE_ORDER
    // so the pixel buffer is RGBA-ordered for ImageData.
    const bitmapPtr = m.FPDFBitmap_Create(w, h, 1);
    try {
      m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, w, h, 0xffffffff);
      // FPDF_REVERSE_BYTE_ORDER = 0x10, FPDF_ANNOT = 0x01
      m.FPDF_RenderPageBitmap(
        bitmapPtr,
        page.pagePtr,
        0,
        0,
        w,
        h,
        0,
        0x01 | 0x10,
      );

      const bufferPtr = m.FPDFBitmap_GetBuffer(bitmapPtr);
      const stride = m.FPDFBitmap_GetStride(bitmapPtr);
      const pixels = new Uint8ClampedArray(w * h * 4);
      const heap = new Uint8Array(
        (m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory })
          .memory.buffer,
        bufferPtr,
        stride * h,
      );
      for (let y = 0; y < h; y++) {
        const srcRow = y * stride;
        const dstRow = y * w * 4;
        pixels.set(heap.subarray(srcRow, srcRow + w * 4), dstRow);
      }
      return new ImageData(pixels, w, h);
    } finally {
      m.FPDFBitmap_Destroy(bitmapPtr);
    }
  }
}
