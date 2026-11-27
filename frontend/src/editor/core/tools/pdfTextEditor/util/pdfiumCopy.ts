import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { ExtendedPdfiumRuntime } from "@editor/services/pdfiumService";

const FPDF_NO_INCREMENTAL = 2;

function heap(m: WrappedPdfiumModule): Uint8Array {
  return (m.pdfium as typeof m.pdfium & ExtendedPdfiumRuntime).HEAPU8;
}

export interface OpenDocument {
  docPtr: number;
  bufferPtr: number;
}

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

export function saveRewritten(
  m: WrappedPdfiumModule,
  docPtr: number,
): Uint8Array {
  const writer = m.PDFiumExt_OpenFileWriter();
  try {
    if (!m.FPDF_SaveAsCopy(docPtr, writer, FPDF_NO_INCREMENTAL))
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
