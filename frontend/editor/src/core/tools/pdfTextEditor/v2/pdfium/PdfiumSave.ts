import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

/**
 * Serialise the current edited document back to a `Uint8Array`.
 *
 * Calls `FPDFPage_GenerateContent` on every loaded page first as a
 * belt-and-braces guard against forgotten commits, then uses the EmbedPDF
 * file-writer shim (already wrapped by `pdfiumService.saveRawDocument` but
 * inlined here to avoid extra deps).
 */
export class PdfiumSave {
  static serialize(doc: EditorDocument): Uint8Array {
    const m = doc.module;
    for (const page of doc.loadedPages()) {
      try {
        m.FPDFPage_GenerateContent(page.pagePtr);
        page.clearDirty();
      } catch {
        /* best-effort */
      }
    }

    const writerPtr = m.PDFiumExt_OpenFileWriter();
    try {
      m.PDFiumExt_SaveAsCopy(doc.docPtr, writerPtr);
      const size = m.PDFiumExt_GetFileWriterSize(writerPtr);
      const outBuf = m.pdfium.wasmExports.malloc(size);
      try {
        m.PDFiumExt_GetFileWriterData(writerPtr, outBuf, size);
        const view = new Uint8Array(size);
        const heap = new Uint8Array(
          (m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory })
            .memory.buffer,
          outBuf,
          size,
        );
        view.set(heap);
        return view;
      } finally {
        m.pdfium.wasmExports.free(outBuf);
      }
    } finally {
      m.PDFiumExt_CloseFileWriter(writerPtr);
    }
  }
}
