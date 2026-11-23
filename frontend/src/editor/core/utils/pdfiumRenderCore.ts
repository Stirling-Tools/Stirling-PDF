/**
 * PDFium page rendering and metadata reads against an explicit module, so the
 * same code runs on the main thread and inside a worker. Nothing here may import
 * pdfiumService: a worker cannot carry its singletons or its UI dependencies.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

/** FPDF_ANNOT (0x01) | FPDF_LCD_TEXT (0x10). */
const PDFIUM_RENDER_FLAGS = 0x01 | 0x10;

/** FPDF_GetLastError() code for a missing/incorrect document password. */
export const FPDF_ERR_PASSWORD = 4;

type Runtime = WrappedPdfiumModule["pdfium"] & {
  HEAPU8: Uint8Array;
};

export interface RenderPdfiumPageOptions {
  /** When true (default), bake the page's own rotation into the bitmap.
   *  When false, render upright so callers can apply CSS rotation. */
  applyRotation?: boolean;
  /** Output format; defaults to PNG. */
  format?: "png" | "jpeg";
  /** JPEG quality [0,1]; ignored for PNG. */
  quality?: number;
}

export interface PageMetadata {
  width: number;
  height: number;
  rotation: number;
}

/** A document opened from memory; the data buffer must outlive the handle. */
export interface MemoryDocument {
  docPtr: number;
  dataPtr: number;
}

/** Opening failed; `code` is FPDF_GetLastError(). */
export class PdfiumOpenFailure extends Error {
  bytesRead?: number;
  constructor(readonly code: number) {
    super(`PDFium could not open the document (error ${code})`);
    this.name = "PdfiumOpenFailure";
  }
}

export function openMemoryDocument(
  m: WrappedPdfiumModule,
  bytes: Uint8Array,
  password = "",
): MemoryDocument {
  const dataPtr = m.pdfium.wasmExports.malloc(bytes.length);
  // Copying to address 0 would hand PDFium garbage it reports as a format error.
  if (!dataPtr) throw new Error("Unable to allocate memory for this PDF");
  // malloc can grow WASM memory, so read the heap view after allocating.
  (m.pdfium as Runtime).HEAPU8.set(bytes, dataPtr);
  const docPtr = m.FPDF_LoadMemDocument(dataPtr, bytes.length, password);
  if (!docPtr) {
    const code = m.FPDF_GetLastError();
    m.pdfium.wasmExports.free(dataPtr);
    throw new PdfiumOpenFailure(code);
  }
  return { docPtr, dataPtr };
}

export function closeMemoryDocument(
  m: WrappedPdfiumModule,
  doc: MemoryDocument,
): void {
  m.FPDF_CloseDocument(doc.docPtr);
  m.pdfium.wasmExports.free(doc.dataPtr);
}

/**
 * Width/height (rotation applied, as FPDF_GetPageWidthF reports them) and
 * rotation, read from the page dictionary only; FPDF_LoadPage would also parse
 * the page's content stream.
 */
export function readPageMetadata(
  m: WrappedPdfiumModule,
  docPtr: number,
  pageIndex: number,
): PageMetadata | null {
  const sizePtr = m.pdfium.wasmExports.malloc(8); // FS_SIZEF: two floats
  try {
    if (!m.FPDF_GetPageSizeByIndexF(docPtr, pageIndex, sizePtr)) return null;
    return {
      width: m.pdfium.getValue(sizePtr, "float"),
      height: m.pdfium.getValue(sizePtr + 4, "float"),
      rotation:
        ((m.EPDF_GetPageRotationByIndex(docPtr, pageIndex) | 0) & 3) * 90,
    };
  } finally {
    m.pdfium.wasmExports.free(sizePtr);
  }
}

/** Row-by-row copy for padded strides, where rows are not contiguous. */
function copyRows(
  heap: Uint8Array,
  bufferPtr: number,
  stride: number,
  w: number,
  h: number,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = bufferPtr + y * stride;
    pixels.set(heap.subarray(srcRow, srcRow + w * 4), y * w * 4);
  }
  return pixels;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  // Only workers have the synchronous reader; it skips an extra task per page.
  const SyncReader = (
    globalThis as {
      FileReaderSync?: new () => { readAsDataURL(blob: Blob): string };
    }
  ).FileReaderSync;
  if (SyncReader) {
    return Promise.resolve(new SyncReader().readAsDataURL(blob));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Encodes pixels on a DOM canvas where there is a document (the main-thread
 *  path, unchanged), and on an OffscreenCanvas inside a worker. */
async function encodePixels(
  pixels: Uint8ClampedArray<ArrayBuffer>,
  w: number,
  h: number,
  format: "png" | "jpeg",
  quality: number | undefined,
): Promise<string | null> {
  const image = new ImageData(pixels, w, h);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(image, 0, 0);
    return format === "jpeg"
      ? canvas.toDataURL("image/jpeg", quality ?? 0.8)
      : canvas.toDataURL();
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob(
    format === "jpeg"
      ? { type: "image/jpeg", quality: quality ?? 0.8 }
      : { type: "image/png" },
  );
  return blobToDataUrl(blob);
}

/** Renders one page (0-indexed) of an open document to a data URL. */
export async function renderPageDataUrl(
  m: WrappedPdfiumModule,
  docPtr: number,
  pageIndex: number,
  scale: number,
  options: RenderPdfiumPageOptions = {},
): Promise<string | null> {
  const { applyRotation = true, format = "png", quality } = options;

  const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
  if (!pagePtr) return null;

  let pixels: Uint8ClampedArray<ArrayBuffer>;
  let w: number;
  let h: number;
  try {
    // Effective dims already account for /Rotate; PDFium auto-applies it during render.
    const rawW = m.FPDF_GetPageWidthF(pagePtr);
    const rawH = m.FPDF_GetPageHeightF(pagePtr);
    // Returns 0–3 for 0°/90°/180°/270° CW.
    const pageRotQuarters = m.FPDFPage_GetRotation(pagePtr) | 0;
    const isQuarterTurn = pageRotQuarters === 1 || pageRotQuarters === 3;

    // false: swap dims back to raw + counter-rotate to cancel PDFium's auto /Rotate.
    const outW = applyRotation ? rawW : isQuarterTurn ? rawH : rawW;
    const outH = applyRotation ? rawH : isQuarterTurn ? rawW : rawH;
    const renderRotate = applyRotation ? 0 : (4 - pageRotQuarters) % 4;

    w = Math.max(1, Math.round(outW * scale));
    h = Math.max(1, Math.round(outH * scale));

    const bitmapPtr = m.FPDFBitmap_Create(w, h, 1);
    try {
      // White background; PDF content doesn't encode paper colour.
      m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, w, h, 0xffffffff);
      m.FPDF_RenderPageBitmap(
        bitmapPtr,
        pagePtr,
        0,
        0,
        w,
        h,
        renderRotate,
        PDFIUM_RENDER_FLAGS,
      );
      const bufferPtr = m.FPDFBitmap_GetBuffer(bitmapPtr);
      const stride = m.FPDFBitmap_GetStride(bitmapPtr);
      const heap = (m.pdfium as Runtime).HEAPU8;
      // @embedpdf/pdfium stores pixels in RGBA order, so rows copy without
      // channel swapping. Copied out before encoding: encoding can await, and a
      // view into the heap is detached by any memory.grow in the meantime.
      pixels =
        stride === w * 4
          ? new Uint8ClampedArray(heap.slice(bufferPtr, bufferPtr + w * h * 4))
          : copyRows(heap, bufferPtr, stride, w, h);
    } finally {
      m.FPDFBitmap_Destroy(bitmapPtr);
    }
  } finally {
    m.FPDF_ClosePage(pagePtr);
  }

  return encodePixels(pixels, w, h, format, quality);
}

export interface FirstPageRender {
  pageCount: number;
  /** One data URL per requested rotation mode. */
  thumbnails: { unrotated?: string; rotated?: string };
  pageRotations: number[];
  pageDimensions: Array<{ width: number; height: number }>;
}

/**
 * Page 1 in the requested rotation modes plus page metadata, from one open
 * document. `allPagesMetadata` false reads page 1's metadata only (for large
 * files opened from a prefix).
 */
export async function renderFirstPage(
  m: WrappedPdfiumModule,
  docPtr: number,
  scale: number,
  render: Omit<RenderPdfiumPageOptions, "applyRotation">,
  modes: ReadonlyArray<"unrotated" | "rotated">,
  allPagesMetadata: boolean,
): Promise<FirstPageRender> {
  const pageCount = m.FPDF_GetPageCount(docPtr);
  const thumbnails: FirstPageRender["thumbnails"] = {};
  for (const mode of modes) {
    const url = await renderPageDataUrl(m, docPtr, 0, scale, {
      ...render,
      applyRotation: mode === "rotated",
    });
    if (!url) throw new Error("PDFium: failed to render page 0");
    thumbnails[mode] = url;
  }

  const first = readPageMetadata(m, docPtr, 0);
  const pageRotations: number[] = [first?.rotation ?? 0];
  const pageDimensions: Array<{ width: number; height: number }> = [
    { width: first?.width ?? 0, height: first?.height ?? 0 },
  ];
  if (allPagesMetadata) {
    for (let i = 1; i < pageCount; i++) {
      const meta = readPageMetadata(m, docPtr, i);
      if (!meta) continue;
      pageRotations[i] = meta.rotation;
      pageDimensions[i] = { width: meta.width, height: meta.height };
    }
  }
  return { pageCount, thumbnails, pageRotations, pageDimensions };
}
