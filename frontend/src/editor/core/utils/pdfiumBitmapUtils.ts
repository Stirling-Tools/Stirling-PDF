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

function setImageObjectMatrix(
  m: WrappedPdfiumModule,
  imageObjPtr: number,
  pdfX: number,
  pdfY: number,
  drawWidth: number,
  drawHeight: number,
): boolean {
  const matrixPtr = m.pdfium.wasmExports.malloc(6 * 4);
  try {
    m.pdfium.setValue(matrixPtr, drawWidth, "float");
    m.pdfium.setValue(matrixPtr + 4, 0, "float");
    m.pdfium.setValue(matrixPtr + 8, 0, "float");
    m.pdfium.setValue(matrixPtr + 12, drawHeight, "float");
    m.pdfium.setValue(matrixPtr + 16, pdfX, "float");
    m.pdfium.setValue(matrixPtr + 20, pdfY, "float");
    return m.FPDFPageObj_SetMatrix(imageObjPtr, matrixPtr);
  } finally {
    m.pdfium.wasmExports.free(matrixPtr);
  }
}

/**
 * Create a PDFium image page object from decoded pixels.
 *
 * The caller owns the returned object until it is inserted into a page or
 * appended to an annotation. Destroy it with FPDFPageObj_Destroy on failure.
 */
export function createBitmapImageObject(
  m: WrappedPdfiumModule,
  docPtr: number,
  pagePtr: number,
  image: DecodedImage,
  pdfX: number,
  pdfY: number,
  drawWidth: number,
  drawHeight: number,
): number | null {
  const bitmapPtr = m.FPDFBitmap_Create(image.width, image.height, 1);
  if (!bitmapPtr) return null;

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
    if (!imageObjPtr) return null;

    if (!m.FPDFImageObj_SetBitmap(pagePtr, 0, imageObjPtr, bitmapPtr)) {
      m.FPDFPageObj_Destroy(imageObjPtr);
      return null;
    }

    if (
      !setImageObjectMatrix(m, imageObjPtr, pdfX, pdfY, drawWidth, drawHeight)
    ) {
      m.FPDFPageObj_Destroy(imageObjPtr);
      return null;
    }

    return imageObjPtr;
  } finally {
    // FPDFImageObj_SetBitmap copies the bitmap data into the image object.
    m.FPDFBitmap_Destroy(bitmapPtr);
  }
}

/**
 * Create a PDFium bitmap from decoded RGBA pixels, attach it to a new image
 * page object, position it via an affine matrix, and insert it into the page.
 *
 * Returns `true` if the image was successfully inserted, `false` otherwise.
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
): boolean {
  const imageObjPtr = createBitmapImageObject(
    m,
    docPtr,
    pagePtr,
    image,
    pdfX,
    pdfY,
    drawWidth,
    drawHeight,
  );
  if (!imageObjPtr) return false;

  m.FPDFPage_InsertObject(pagePtr, imageObjPtr);
  return true;
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
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
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
