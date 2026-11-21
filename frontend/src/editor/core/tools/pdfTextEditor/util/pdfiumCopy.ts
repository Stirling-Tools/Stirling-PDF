import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { ExtendedPdfiumRuntime } from "@editor/services/pdfiumService";

/** `FPDF_SaveAsCopy` flag: append the changes as a new revision. */
const FPDF_INCREMENTAL = 1;

function heap(m: WrappedPdfiumModule): Uint8Array {
  return (m.pdfium as typeof m.pdfium & ExtendedPdfiumRuntime).HEAPU8;
}

export interface OpenDocument {
  docPtr: number;
  bufferPtr: number;
}

// Its own copy, never the shared document the viewer reads: the change must
// not show anywhere until the editor reopens the result.
export function openCopy(
  m: WrappedPdfiumModule,
  bytes: Uint8Array,
): OpenDocument {
  const bufferPtr = m.pdfium.wasmExports.malloc(bytes.length);
  if (!bufferPtr) throw new Error("Unable to allocate memory for this PDF");
  heap(m).set(bytes, bufferPtr);
  const docPtr = m.FPDF_LoadMemDocument(bufferPtr, bytes.length, "");
  if (!docPtr) {
    m.pdfium.wasmExports.free(bufferPtr);
    throw new Error("PDFium could not open the saved document");
  }
  return { docPtr, bufferPtr };
}

export function closeCopy(m: WrappedPdfiumModule, open: OpenDocument) {
  m.FPDF_CloseDocument(open.docPtr);
  m.pdfium.wasmExports.free(open.bufferPtr);
}

export function saveIncrement(
  m: WrappedPdfiumModule,
  docPtr: number,
): Uint8Array {
  const writer = m.PDFiumExt_OpenFileWriter();
  try {
    if (!m.FPDF_SaveAsCopy(docPtr, writer, FPDF_INCREMENTAL))
      throw new Error("PDFium could not save the changed document");
    const size = m.PDFiumExt_GetFileWriterSize(writer);
    const out = m.pdfium.wasmExports.malloc(size);
    try {
      m.PDFiumExt_GetFileWriterData(writer, out, size);
      return heap(m).slice(out, out + size);
    } finally {
      m.pdfium.wasmExports.free(out);
    }
  } finally {
    m.PDFiumExt_CloseFileWriter(writer);
  }
}

export function withFloats<T>(
  m: WrappedPdfiumModule,
  count: number,
  read: (ptr: number) => T,
): T {
  const ptr = m.pdfium.wasmExports.malloc(count * 4);
  try {
    return read(ptr);
  } finally {
    m.pdfium.wasmExports.free(ptr);
  }
}

export function withPage<T>(
  m: WrappedPdfiumModule,
  docPtr: number,
  index: number,
  use: (pagePtr: number) => T,
): T {
  const pagePtr = m.FPDF_LoadPage(docPtr, index);
  if (!pagePtr) throw new Error(`PDFium could not load page ${index + 1}`);
  try {
    return use(pagePtr);
  } finally {
    m.FPDF_ClosePage(pagePtr);
  }
}
