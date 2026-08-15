import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";

/** Renders pages to bitmaps for the on-screen preview. */
export class PdfiumPageRenderer {
  static rasterSize(
    pageWidth: number,
    pageHeight: number,
    scale: number,
  ): { width: number; height: number } {
    return {
      width: Math.max(1, Math.round(pageWidth * scale)),
      height: Math.max(1, Math.round(pageHeight * scale)),
    };
  }

  static async render(
    doc: EditorDocument,
    page: Page,
    scale: number,
  ): Promise<ImageData> {
    const m = doc.module;
    // No flush: FPDF_RenderPageBitmap draws from the in-memory object list, so
    // the preview is current without rewriting the content stream.
    const { width: w, height: h } = PdfiumPageRenderer.rasterSize(
      page.width,
      page.height,
      scale,
    );

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

      // Second pass for the form layer. A widget with no appearance stream is
      // drawn ONLY here - FPDF_ANNOT alone leaves such fields blank, which is
      // why they were invisible in the editor but fine in the viewer.
      const formEnv = doc.formEnvironment();
      if (formEnv) {
        doc.notifyFormPageLoaded(page);
        const formMod = m as unknown as {
          FPDF_FFLDraw?: (
            env: number,
            bitmap: number,
            pagePtr: number,
            startX: number,
            startY: number,
            sizeX: number,
            sizeY: number,
            rotate: number,
            flags: number,
          ) => void;
        };
        try {
          formMod.FPDF_FFLDraw?.(
            formEnv,
            bitmapPtr,
            page.pagePtr,
            0,
            0,
            w,
            h,
            0,
            0x01 | 0x10,
          );
        } catch {
          /* the page content is already drawn; the form layer is additive */
        }
      }

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
