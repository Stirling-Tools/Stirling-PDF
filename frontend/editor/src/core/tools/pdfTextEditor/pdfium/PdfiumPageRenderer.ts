import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import {
  acquireRaster,
  releaseRaster,
} from "@app/tools/pdfTextEditor/pdfium/rasterPool";

// A display ratio above this buys no visible sharpness for a PDF preview and
// doubles memory per step, so the raster stops following it there.
const MAX_DPR = 3;

// Budget for one page's bitmap, in pixels (32M ≈ 128MB of RGBA). Zoom and
// device ratio multiply together, and a poster-sized page at that product can
// otherwise ask the wasm heap for gigabytes.
const MAX_RASTER_PIXELS = 32_000_000;

// No single axis may be allocated past this, whatever the pixel product says.
const MAX_RASTER_DIMENSION = 32_768;

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
   * The integer bitmap `render` will ask PDFium for. `deviceScale` is only a
   * heuristic: its 0.25 floor can exceed the budget on a giant page and a
   * caller-supplied scale is not bounded at all, so the final dimensions are
   * checked here, at the allocation boundary.
   */
  static rasterBudget(
    pageWidth: number,
    pageHeight: number,
    scale: number,
  ): { width: number; height: number } {
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const width = Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 1;
    const height =
      Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 1;
    // One factor for both axes: PDFium takes the two display sizes separately,
    // so capping each axis on its own would rasterise one of them coarser than
    // the budget asks for and inflate the pixel count of the other.
    //
    // The bound applies to the scale, before the page is multiplied by it: a
    // finite page at a huge scale overflows to Infinity, and any dimension
    // derived from that product collapses through Infinity * 0 to NaN, which
    // neither Math.min nor Math.max sanitises. Each term here stays finite on
    // its own, and the square roots keep the pixel term finite when
    // `width * height` overflows.
    const effective = Math.min(
      safeScale,
      MAX_RASTER_DIMENSION / width,
      MAX_RASTER_DIMENSION / height,
      Math.sqrt(MAX_RASTER_PIXELS) / Math.sqrt(width) / Math.sqrt(height),
    );
    return {
      width: Math.max(
        1,
        Math.min(MAX_RASTER_DIMENSION, Math.floor(width * effective)),
      ),
      height: Math.max(
        1,
        Math.min(MAX_RASTER_DIMENSION, Math.floor(height * effective)),
      ),
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
    const { width: w, height: h } = PdfiumPageRenderer.rasterBudget(
      page.width,
      page.height,
      scale,
    );

    // BGRA bitmap (see RASTER_FORMAT_BGRA), fill white, then render with
    // REVERSE_BYTE_ORDER so the pixel buffer is RGBA-ordered for ImageData.
    const bitmapPtr = acquireRaster(m, w, h);
    if (!bitmapPtr) {
      throw new Error(`could not allocate a ${w}x${h} page bitmap`);
    }
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
      const heap = new Uint8Array(
        (m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory })
          .memory.buffer,
        bufferPtr,
        stride * h,
      );
      // The ImageData outlives this call, so its pixels have to be copied out
      // of the heap: a view would detach on the next memory.grow. A padded
      // stride is the only case that needs the row-by-row compaction.
      let pixels: Uint8ClampedArray<ArrayBuffer>;
      if (stride === w * 4) {
        pixels = new Uint8ClampedArray(
          heap.buffer,
          bufferPtr,
          w * h * 4,
        ).slice();
      } else {
        pixels = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
          const srcRow = y * stride;
          pixels.set(heap.subarray(srcRow, srcRow + w * 4), y * w * 4);
        }
      }
      return new ImageData(pixels, w, h);
    } finally {
      releaseRaster(m, bitmapPtr, h);
    }
  }
}
