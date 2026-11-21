import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

const FPDF_REVERSE_BYTE_ORDER = 0x10;

/** The first page drawn by PDFium onto white at `width` x `height` pixels, as RGBA rows. */
export function rasterFirstPage(
  doc: EditorDocument,
  width: number,
  height: number,
  alpha = true,
): Uint8Array {
  const m = doc.module;
  const bitmap = m.FPDFBitmap_Create(width, height, alpha ? 1 : 0);
  try {
    m.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff);
    m.FPDF_RenderPageBitmap(
      bitmap,
      doc.page(0).pagePtr,
      0,
      0,
      width,
      height,
      0,
      FPDF_REVERSE_BYTE_ORDER,
    );
    const memory = (
      m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory }
    ).memory;
    return new Uint8Array(
      memory.buffer,
      m.FPDFBitmap_GetBuffer(bitmap),
      m.FPDFBitmap_GetStride(bitmap) * height,
    ).slice();
  } finally {
    m.FPDFBitmap_Destroy(bitmap);
  }
}

/** Pixels whose colour differs by more than antialiasing noise between two equal-sized rasters. */
export function changedPixels(a: Uint8Array, b: Uint8Array): number {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4)
    if ([0, 1, 2].some((c) => Math.abs(a[i + c] - b[i + c]) > 2)) changed++;
  return changed;
}

/** Pixels whose colour differs at all between two equal-sized canvas images. */
export function differingPixels(a: ImageData, b: ImageData): number {
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2]
    )
      count++;
  }
  return count;
}
