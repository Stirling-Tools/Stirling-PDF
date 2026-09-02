import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

/** `FPDF_SaveAsCopy` flags. */
const FPDF_INCREMENTAL = 1;

interface SaveFlagsModule {
  FPDF_SaveAsCopy?: (doc: number, writer: number, flags: number) => boolean;
}

export interface SerializeOptions {
  // Append a revision instead of rewriting: the only way a signature stays
  // verifiable for the revision it signed.
  incremental?: boolean;
}

/** Serialise the current edited document back to a `Uint8Array`. */
export class PdfiumSave {
  static serialize(
    doc: EditorDocument,
    options: SerializeOptions = {},
  ): Uint8Array {
    const m = doc.module;
    const failedPages: number[] = [];
    for (const page of doc.loadedPages()) {
      try {
        // Always force a flush before save.
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
      // The writer the shim hands back is the FPDF_FILEWRITE the flagged
      // entry point expects, so incremental mode needs no extra plumbing.
      const withFlags = (m as unknown as SaveFlagsModule).FPDF_SaveAsCopy;
      if (options.incremental && typeof withFlags === "function") {
        withFlags(doc.docPtr, writerPtr, FPDF_INCREMENTAL);
      } else {
        m.PDFiumExt_SaveAsCopy(doc.docPtr, writerPtr);
      }
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
