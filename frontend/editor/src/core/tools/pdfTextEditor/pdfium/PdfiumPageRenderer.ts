import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";

// A display ratio above this buys no visible sharpness for a PDF preview and
// doubles memory per step, so the raster stops following it there.
const MAX_DPR = 3;

// Budget for one page's bitmap, in pixels (32M ≈ 128MB of RGBA). Zoom and
// device ratio multiply together, and a poster-sized page at that product can
// otherwise ask the wasm heap for gigabytes.
const MAX_RASTER_PIXELS = 32_000_000;

/** Copy a BGRA/RGBA PDFium bitmap into ImageData-ready pixels. */
function copyBitmap(
  m: EditorDocument["module"],
  bitmapPtr: number,
  w: number,
  h: number,
): Uint8ClampedArray<ArrayBuffer> {
  const bufferPtr = m.FPDFBitmap_GetBuffer(bitmapPtr);
  const stride = m.FPDFBitmap_GetStride(bitmapPtr);
  const pixels = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  const heap = new Uint8Array(
    (m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory }).memory
      .buffer,
    bufferPtr,
    stride * h,
  );
  for (let y = 0; y < h; y++) {
    const srcRow = y * stride;
    const dstRow = y * w * 4;
    pixels.set(heap.subarray(srcRow, srcRow + w * 4), dstRow);
  }
  return pixels;
}

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

  /**
   * The scale to RENDER at for a page displayed at `cssScale`: the display's
   * pixel ratio multiplied in, so a HiDPI screen gets real pixels instead of
   * a browser-upscaled bitmap, then capped by the per-page pixel budget.
   */
  static deviceScale(
    pageWidth: number,
    pageHeight: number,
    cssScale: number,
    dpr: number,
  ): number {
    const ratio = Math.min(Math.max(dpr || 1, 1), MAX_DPR);
    const cap = Math.sqrt(
      MAX_RASTER_PIXELS / Math.max(1, pageWidth * pageHeight),
    );
    return Math.max(0.25, Math.min(cssScale * ratio, cap));
  }

  /**
   * Repaint only `rect` (raster pixels, top-left origin) of the page.
   *
   * The full-page pass is 100-250 ms on a dense page; a caret edit invalidates
   * a few hundred pixels. PDFium renders the page shifted by `-x/-y` into a
   * bitmap the size of the region, so the copy back is proportional to the
   * edit, not the page. Returns null when the caller should just render the
   * whole page (region too large, or no usable area).
   */
  static async renderRegion(
    doc: EditorDocument,
    page: Page,
    scale: number,
    rect: { x: number; y: number; width: number; height: number },
  ): Promise<{ image: ImageData; x: number; y: number } | null> {
    const m = doc.module;
    const full = PdfiumPageRenderer.rasterSize(page.width, page.height, scale);
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const right = Math.min(full.width, Math.ceil(rect.x + rect.width));
    const bottom = Math.min(full.height, Math.ceil(rect.y + rect.height));
    const w = right - x;
    const h = bottom - y;
    if (w < 1 || h < 1) return null;
    // Past this the fixed setup cost is not worth the partial path.
    if (w * h > full.width * full.height * 0.5) return null;

    const bitmapPtr = m.FPDFBitmap_Create(w, h, 1);
    try {
      m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, w, h, 0xffffffff);
      m.FPDF_RenderPageBitmap(
        bitmapPtr,
        page.pagePtr,
        -x,
        -y,
        full.width,
        full.height,
        0,
        0x01 | 0x10,
      );
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
            -x,
            -y,
            full.width,
            full.height,
            0,
            0x01 | 0x10,
          );
        } catch {
          /* content is already drawn; the form layer is additive */
        }
      }
      const pixels = copyBitmap(m, bitmapPtr, w, h);
      return { image: new ImageData(pixels, w, h), x, y };
    } finally {
      m.FPDFBitmap_Destroy(bitmapPtr);
    }
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

      return new ImageData(copyBitmap(m, bitmapPtr, w, h), w, h);
    } finally {
      m.FPDFBitmap_Destroy(bitmapPtr);
    }
  }
}
