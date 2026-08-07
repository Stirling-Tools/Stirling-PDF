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
    const failedPages: number[] = [];
    for (const page of doc.loadedPages()) {
      try {
        // Always force a flush before save - the deferred flag may be
        // false because a render already flushed, but mark+flush is
        // idempotent and the safe default for any page that's still
        // marked dirty.
        if (page.dirty) page.markNeedsGenerate();
        page.flushGenerate(m);
        page.clearDirty();
      } catch {
        failedPages.push(page.index + 1);
      }
    }
    if (failedPages.length > 0) {
      // A swallowed flush failure would serialize the page's stale
      // pre-edit content while the UI reports a successful save.
      throw new Error(
        `Could not apply edits on page${failedPages.length > 1 ? "s" : ""} ` +
          `${failedPages.join(", ")}; save aborted so no edits are silently lost.`,
      );
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
