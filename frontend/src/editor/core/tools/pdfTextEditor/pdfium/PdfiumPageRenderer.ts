import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { transformRectAABB } from "@editor/tools/pdfTextEditor/model/affine";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";

// A display ratio above this buys no visible sharpness for a PDF preview and
// doubles memory per step, so the raster stops following it there.
const MAX_DPR = 3;

// Budget for one page's bitmap, in pixels (32M ≈ 128MB of RGBA). Zoom and
// device ratio multiply together, and a poster-sized page at that product can
// otherwise ask the wasm heap for gigabytes.
const MAX_RASTER_PIXELS = 32_000_000;

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

  static async render(
    doc: EditorDocument,
    page: Page,
    scale: number,
  ): Promise<ImageData> {
    const { width, height } = PdfiumPageRenderer.rasterSize(
      page.width,
      page.height,
      scale,
    );
    return PdfiumPageRenderer.renderArea(doc, page, scale, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  /** The bitmap pixels {@link render} at `scale` draws raw page-space `raw` into, or null when none. */
  static pixelsCovering(
    page: Page,
    scale: number,
    raw: PageRect,
  ): PageRect | null {
    const full = PdfiumPageRenderer.rasterSize(page.width, page.height, scale);
    const shown = transformRectAABB(page.display, raw);
    const kx = full.width / page.width;
    const ky = full.height / page.height;
    const left = Math.max(0, Math.floor(shown.x * kx) - 1);
    const top = Math.max(
      0,
      Math.floor((page.height - shown.y - shown.height) * ky) - 1,
    );
    const right = Math.min(
      full.width,
      Math.ceil((shown.x + shown.width) * kx) + 1,
    );
    const bottom = Math.min(
      full.height,
      Math.ceil((page.height - shown.y) * ky) + 1,
    );
    if (right <= left || bottom <= top) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /** The pixels {@link render} would draw inside `area` (bitmap pixels, top-left origin), drawing nothing else. */
  static async renderArea(
    doc: EditorDocument,
    page: Page,
    scale: number,
    area: PageRect,
  ): Promise<ImageData> {
    const m = doc.module;
    // No flush needed: rendering reads the in-memory objects; the page is offset to the area and clipped.
    const full = PdfiumPageRenderer.rasterSize(page.width, page.height, scale);
    const w = Math.max(1, area.width);
    const h = Math.max(1, area.height);

    // BGRA bitmap = format 1, fill white, then render with REVERSE_BYTE_ORDER
    // so the pixel buffer is RGBA-ordered for ImageData.
    const bitmapPtr = m.FPDFBitmap_Create(w, h, 1);
    try {
      m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, w, h, 0xffffffff);
      // FPDF_REVERSE_BYTE_ORDER = 0x10, FPDF_ANNOT = 0x01
      m.FPDF_RenderPageBitmap(
        bitmapPtr,
        page.pagePtr,
        -area.x,
        -area.y,
        full.width,
        full.height,
        0,
        0x01 | 0x10,
      );
      page.shownInViewer = true;

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
            -area.x,
            -area.y,
            full.width,
            full.height,
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
