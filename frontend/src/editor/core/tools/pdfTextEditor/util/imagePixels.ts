// Read an image object's pixels back out of PDFium: the round trip must hand
// over the picture as it stands now, not the file it originally came from.
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

export interface ImagePixels {
  rgba: Uint8Array;
  width: number;
  height: number;
}

interface ImageBitmapModule {
  FPDFImageObj_GetBitmap?: (obj: number) => number;
  FPDFImageObj_GetRenderedBitmap?: (
    doc: number,
    page: number,
    obj: number,
  ) => number;
  FPDFBitmap_GetBuffer?: (bitmap: number) => number;
  FPDFBitmap_GetWidth?: (bitmap: number) => number;
  FPDFBitmap_GetHeight?: (bitmap: number) => number;
  FPDFBitmap_GetStride?: (bitmap: number) => number;
  FPDFBitmap_GetFormat?: (bitmap: number) => number;
  FPDFBitmap_Destroy?: (bitmap: number) => void;
}

/** FPDFBitmap_* format ids. */
const FORMAT_GRAY = 1;
const FORMAT_BGR = 2;
const FORMAT_BGRA = 4;

export function readImageObjectPixels(
  doc: EditorDocument,
  pageIndex: number,
  objPtr: number,
): ImagePixels | null {
  if (!objPtr) return null;
  const m = doc.module;
  const mod = m as unknown as ImageBitmapModule;
  const page = doc.page(pageIndex);
  // Any pending edit has to be in the content stream before PDFium will
  // rasterise the object as the user currently sees it.
  page.flushGenerate(m);

  let bitmap = 0;
  try {
    bitmap =
      mod.FPDFImageObj_GetRenderedBitmap?.(doc.docPtr, page.pagePtr, objPtr) ??
      0;
    if (!bitmap) bitmap = mod.FPDFImageObj_GetBitmap?.(objPtr) ?? 0;
    if (!bitmap) return null;

    const width = mod.FPDFBitmap_GetWidth?.(bitmap) ?? 0;
    const height = mod.FPDFBitmap_GetHeight?.(bitmap) ?? 0;
    const stride = mod.FPDFBitmap_GetStride?.(bitmap) ?? 0;
    const buffer = mod.FPDFBitmap_GetBuffer?.(bitmap) ?? 0;
    const format = mod.FPDFBitmap_GetFormat?.(bitmap) ?? FORMAT_BGRA;
    if (width <= 0 || height <= 0 || stride <= 0 || !buffer) return null;

    const heap = heapView(m);
    const bytesPerPixel =
      format === FORMAT_GRAY ? 1 : format === FORMAT_BGR ? 3 : 4;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      let src = buffer + y * stride;
      let dst = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        // PDFium hands back gray or BGR(A); the canvas/PNG world wants RGBA.
        if (format === FORMAT_GRAY) {
          rgba[dst] = heap[src];
          rgba[dst + 1] = heap[src];
          rgba[dst + 2] = heap[src];
          rgba[dst + 3] = 255;
        } else {
          rgba[dst] = heap[src + 2];
          rgba[dst + 1] = heap[src + 1];
          rgba[dst + 2] = heap[src];
          rgba[dst + 3] = format === FORMAT_BGRA ? heap[src + 3] : 255;
        }
        src += bytesPerPixel;
        dst += 4;
      }
    }
    return { rgba, width, height };
  } catch {
    return null;
  } finally {
    if (bitmap) {
      try {
        mod.FPDFBitmap_Destroy?.(bitmap);
      } catch {
        /* best-effort */
      }
    }
  }
}

/** Re-acquired per call: growing the WASM memory detaches an older view. */
function heapView(m: WrappedPdfiumModule): Uint8Array {
  const memory = (
    m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory }
  ).memory;
  return new Uint8Array(memory.buffer);
}
