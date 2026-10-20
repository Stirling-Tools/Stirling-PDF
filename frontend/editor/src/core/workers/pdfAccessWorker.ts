import { init } from "@embedpdf/pdfium";
import { readPdfiumAccess } from "@app/utils/pdfiumAccess";
import type { PdfAccess } from "@app/services/pdfAccessService";

/** A worker owns one inspection; termination releases its entire WASM heap. */
export interface PdfAccessRequest {
  file: Blob;
  password: string;
  wasmUrl: string;
}

export type PdfAccessResponse =
  | { access: PdfAccess }
  | { error: string; code?: number };

self.onmessage = async ({ data }: MessageEvent<PdfAccessRequest>) => {
  try {
    const response = await fetch(data.wasmUrl);
    if (!response.ok) throw new Error("Unable to load PDF security reader");
    const module = await init({ wasmBinary: await response.arrayBuffer() });
    module.PDFiumExt_Init();
    const bytes = new Uint8Array(await data.file.arrayBuffer());
    const pointer = module.pdfium.wasmExports.malloc(bytes.length);
    if (!pointer) throw new Error("Unable to allocate memory for this PDF");
    try {
      // malloc can grow WASM memory, so read its current view after allocation.
      const runtime = module.pdfium as typeof module.pdfium & {
        HEAPU8: Uint8Array;
      };
      runtime.HEAPU8.set(bytes, pointer);
      const document = module.FPDF_LoadMemDocument(
        pointer,
        bytes.length,
        data.password,
      );
      if (!document) {
        self.postMessage({
          error: "Unable to open PDF",
          code: module.FPDF_GetLastError(),
        } satisfies PdfAccessResponse);
        return;
      }
      try {
        const access = readPdfiumAccess(module, document, data.password);
        if (access.encrypted && data.password !== "") {
          const empty = module.FPDF_LoadMemDocument(pointer, bytes.length, "");
          if (empty) module.FPDF_CloseDocument(empty);
          else if (module.FPDF_GetLastError() !== 4)
            throw new Error("Unable to verify the PDF opening password");
          access.requiresOpeningPassword = !empty;
        }
        self.postMessage({ access } satisfies PdfAccessResponse);
      } finally {
        module.FPDF_CloseDocument(document);
      }
    } finally {
      module.pdfium.wasmExports.free(pointer);
    }
  } catch {
    self.postMessage({
      error: "Unable to inspect PDF security locally",
    } satisfies PdfAccessResponse);
  }
};
