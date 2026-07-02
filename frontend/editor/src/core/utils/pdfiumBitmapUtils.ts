/**
 * pdfiumBitmapUtils — Shared utilities for working with PDFium WASM bitmaps.
 *
 * Centralises the RGBA→BGRA pixel conversion and image-to-page-object
 * embedding that previously appeared (copy-pasted) in at least 5 files.
 *
 * Performance note: instead of calling `m.pdfium.setValue()` per pixel
 * (which crosses the JS↔WASM FFI boundary on every call), we perform
 * the colour-channel swizzle in a plain JS TypedArray and then bulk-
 * copy the result into the WASM heap with a single `HEAPU8.set()`.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

/** FPDF_ANNOT_LINK */
export const FPDF_ANNOT_LINK = 4;
/** FPDF_ANNOT_WIDGET (form field) */
export const FPDF_ANNOT_WIDGET = 20;
/** FPDF_ANNOT_INK */
export const FPDF_ANNOT_INK = 15;
/** FPDF_ANNOT_LINE */
export const FPDF_ANNOT_LINE = 3;
/** PDFACTION_GOTO */
export const PDFACTION_GOTO = 1;
/** PDFACTION_URI */
export const PDFACTION_URI = 3;
/** FLAT_PRINT (for FPDFPage_Flatten) */
export const FLAT_PRINT = 2;

/**
 * Convert an RGBA pixel buffer to BGRA (PDFium's expected format) **in place
 * inside the WASM heap** with a single bulk memcpy.
 *
 * When `stride === width * 4` the copy is a single `HEAPU8.set()`.
 * When the bitmap has padding (stride > width * 4), rows are copied
 * individually to skip the padding bytes.
 *
 * This is ~100× faster than per-pixel `m.pdfium.setValue()` calls for
 * large images.
 */
export function copyRgbaToBgraHeap(
  m: WrappedPdfiumModule,
  rgba: Uint8Array | Uint8ClampedArray,
  bufferPtr: number,
  width: number,
  height: number,
  stride: number,
): void {
  const rowBytes = width * 4;

  if (stride === rowBytes) {
    // Fast path: no padding — single bulk copy after swizzle
    const bgra = new Uint8Array(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      bgra[i] = rgba[i + 2]; // B
      bgra[i + 1] = rgba[i + 1]; // G
      bgra[i + 2] = rgba[i]; // R
      bgra[i + 3] = rgba[i + 3]; // A
    }
    new Uint8Array((m.pdfium.wasmExports as any).memory.buffer).set(
      bgra,
      bufferPtr,
    );
  } else {
    // Stride has padding — swizzle + copy row by row
    const rowBuf = new Uint8Array(rowBytes);
    const heap = new Uint8Array((m.pdfium.wasmExports as any).memory.buffer);
    for (let y = 0; y < height; y++) {
      const srcRowStart = y * rowBytes;
      for (let x = 0; x < rowBytes; x += 4) {
        rowBuf[x] = rgba[srcRowStart + x + 2]; // B
        rowBuf[x + 1] = rgba[srcRowStart + x + 1]; // G
        rowBuf[x + 2] = rgba[srcRowStart + x]; // R
        rowBuf[x + 3] = rgba[srcRowStart + x + 3]; // A
      }
      heap.set(rowBuf, bufferPtr + y * stride);
    }
  }
}
export interface DecodedImage {
  rgba: Uint8Array;
  width: number;
  height: number;
}

/**
 * Create a PDFium bitmap from decoded RGBA pixels, attach it to a new image
 * page object, position it via an affine matrix, and insert it into the page.
 *
 * Returns the new image object pointer on success, or 0 on failure. The
 * caller can use the pointer directly instead of re-looking it up by index
 * (FPDFPage_GetObject returns null until GenerateContent runs).
 * All intermediate WASM resources are cleaned up on failure.
 */
export function embedBitmapImageOnPage(
  m: WrappedPdfiumModule,
  docPtr: number,
  pagePtr: number,
  image: DecodedImage,
  pdfX: number,
  pdfY: number,
  drawWidth: number,
  drawHeight: number,
): number {
  const bitmapPtr = m.FPDFBitmap_Create(image.width, image.height, 1);
  if (!bitmapPtr) return 0;

  try {
    const bufferPtr = m.FPDFBitmap_GetBuffer(bitmapPtr);
    const stride = m.FPDFBitmap_GetStride(bitmapPtr);

    copyRgbaToBgraHeap(
      m,
      image.rgba,
      bufferPtr,
      image.width,
      image.height,
      stride,
    );

    const imageObjPtr = m.FPDFPageObj_NewImageObj(docPtr);
    if (!imageObjPtr) return 0;

    const setBitmapOk = m.FPDFImageObj_SetBitmap(
      pagePtr,
      0,
      imageObjPtr,
      bitmapPtr,
    );
    if (!setBitmapOk) {
      m.FPDFPageObj_Destroy(imageObjPtr);
      return 0;
    }

    // -- early-destroy the bitmap; PDFium has copied the pixel data internally
    m.FPDFBitmap_Destroy(bitmapPtr);

    // Set affine transform: [a b c d e f]
    const matrixPtr = m.pdfium.wasmExports.malloc(6 * 4);
    try {
      m.pdfium.setValue(matrixPtr, drawWidth, "float"); // a — scaleX
      m.pdfium.setValue(matrixPtr + 4, 0, "float"); // b
      m.pdfium.setValue(matrixPtr + 8, 0, "float"); // c
      m.pdfium.setValue(matrixPtr + 12, drawHeight, "float"); // d — scaleY
      m.pdfium.setValue(matrixPtr + 16, pdfX, "float"); // e — translateX
      m.pdfium.setValue(matrixPtr + 20, pdfY, "float"); // f — translateY

      if (!m.FPDFPageObj_SetMatrix(imageObjPtr, matrixPtr)) {
        m.FPDFPageObj_Destroy(imageObjPtr);
        return 0;
      }
    } finally {
      m.pdfium.wasmExports.free(matrixPtr);
    }

    m.FPDFPage_InsertObject(pagePtr, imageObjPtr);
    return imageObjPtr;
  } finally {
    // Safety net: FPDFBitmap_Destroy is a no-op if ptr is 0 in most PDFium
    // builds but guard anyway.  If already destroyed above, the second call
    // is harmless because we allow it to be idempotent.
    // We use a try-catch to be safe across PDFium WASM builds.
    try {
      m.FPDFBitmap_Destroy(bitmapPtr);
    } catch {
      /* already freed */
    }
  }
}
interface JpegRuntime {
  addFunction: (fn: (...args: number[]) => number, sig: string) => number;
  removeFunction: (ptr: number) => void;
  HEAPU8: Uint8Array;
}

interface JpegImageModule {
  FPDFImageObj_LoadJpegFileInline?: (
    pages: number,
    count: number,
    imageObject: number,
    fileAccess: number,
  ) => boolean;
}

/**
 * Embed `jpegBytes` as an image object WITHOUT re-encoding - the original JPEG
 * stream is stored directly (DCTDecode), so the output stays small. Contrast
 * `embedBitmapImageOnPage`, which uploads decoded RGBA (Flate-compressed pixels,
 * typically several times larger for a photo).
 *
 * Returns the new object pointer, or 0 if the JPEG API is unavailable or the
 * load failed (caller falls back to the bitmap path). Uses an FPDF_FILEACCESS
 * shim backed by an emscripten function pointer over the JS byte array.
 */
export function embedJpegImageOnPage(
  m: WrappedPdfiumModule,
  docPtr: number,
  pagePtr: number,
  jpegBytes: Uint8Array,
  pdfX: number,
  pdfY: number,
  drawWidth: number,
  drawHeight: number,
): number {
  const rt = m.pdfium as unknown as JpegRuntime;
  const loadJpeg = (m as unknown as JpegImageModule)
    .FPDFImageObj_LoadJpegFileInline;
  if (!loadJpeg || typeof rt.addFunction !== "function") return 0;

  const imageObjPtr = m.FPDFPageObj_NewImageObj(docPtr);
  if (!imageObjPtr) return 0;

  const len = jpegBytes.length;
  // m_GetBlock(param, position, pBuf, size): copy the requested slice into the
  // WASM heap. PDFium guarantees the range stays within [0, len). Returns a
  // non-zero byte count on success, 0 on an out-of-range request (error).
  const getBlock = (
    _param: number,
    position: number,
    pBuf: number,
    size: number,
  ): number => {
    if (position < 0 || position + size > len) return 0;
    rt.HEAPU8.set(jpegBytes.subarray(position, position + size), pBuf);
    return size;
  };
  const fnPtr = rt.addFunction(getBlock, "iiiii");
  // FPDF_FILEACCESS = { unsigned long m_FileLen; GetBlock* m_GetBlock; void* m_Param } (12 bytes, wasm32).
  const faPtr = m.pdfium.wasmExports.malloc(12);
  m.pdfium.setValue(faPtr, len, "i32");
  m.pdfium.setValue(faPtr + 4, fnPtr, "i32");
  m.pdfium.setValue(faPtr + 8, 0, "i32");
  // cwrapped boolean call - returns false on error rather than throwing, so no
  // try/finally is needed around it; free the shim + struct right after.
  const loaded = !!loadJpeg(0, 0, imageObjPtr, faPtr);
  m.pdfium.wasmExports.free(faPtr);
  try {
    rt.removeFunction(fnPtr);
  } catch {
    /* best-effort */
  }
  if (!loaded) {
    m.FPDFPageObj_Destroy(imageObjPtr);
    return 0;
  }

  const matrixPtr = m.pdfium.wasmExports.malloc(6 * 4);
  try {
    m.pdfium.setValue(matrixPtr, drawWidth, "float");
    m.pdfium.setValue(matrixPtr + 4, 0, "float");
    m.pdfium.setValue(matrixPtr + 8, 0, "float");
    m.pdfium.setValue(matrixPtr + 12, drawHeight, "float");
    m.pdfium.setValue(matrixPtr + 16, pdfX, "float");
    m.pdfium.setValue(matrixPtr + 20, pdfY, "float");
    if (!m.FPDFPageObj_SetMatrix(imageObjPtr, matrixPtr)) {
      m.FPDFPageObj_Destroy(imageObjPtr);
      return 0;
    }
  } finally {
    m.pdfium.wasmExports.free(matrixPtr);
  }

  m.FPDFPage_InsertObject(pagePtr, imageObjPtr);
  return imageObjPtr;
}

/**
 * Draw a simple light-grey rectangle as a placeholder for annotations
 * that could not be rendered.
 */
export function drawPlaceholderRect(
  m: WrappedPdfiumModule,
  pagePtr: number,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const pathPtr = m.FPDFPageObj_CreateNewPath(x, y);
  if (!pathPtr) return;

  m.FPDFPath_LineTo(pathPtr, x + width, y);
  m.FPDFPath_LineTo(pathPtr, x + width, y + height);
  m.FPDFPath_LineTo(pathPtr, x, y + height);
  m.FPDFPath_Close(pathPtr);

  m.FPDFPageObj_SetFillColor(pathPtr, 230, 230, 230, 150);
  m.FPDFPageObj_SetStrokeColor(pathPtr, 128, 128, 128, 255);
  m.FPDFPageObj_SetStrokeWidth(pathPtr, 1);

  // fillMode 1 = alternate fill, stroke = true
  m.FPDFPath_SetDrawMode(pathPtr, 1, true);

  m.FPDFPage_InsertObject(pagePtr, pathPtr);
}

/**
 * Decode an image data URL (e.g. `data:image/png;base64,...`) to raw RGBA
 * pixel data via an offscreen canvas.
 */
export function decodeImageDataUrl(
  dataUrl: string,
): Promise<DecodedImage | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({
          rgba: new Uint8Array(imageData.data.buffer),
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
