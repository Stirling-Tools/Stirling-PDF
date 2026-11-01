import { init, type PdfiumModule } from "@embedpdf/pdfium";
import { readPdfiumAccess } from "@editor/utils/pdfiumAccess";
import type { PdfAccess } from "@editor/services/pdfAccessService";

/** A worker owns one inspection; termination releases its entire WASM heap. */
export interface PdfAccessRequest {
  file: Blob;
  password: string;
  wasmUrl: string;
  wasmModule: WebAssembly.Module | null;
}

export type PdfAccessResponse =
  | { access: PdfAccess }
  | { error: string; code?: number };

self.onmessage = async ({ data }: MessageEvent<PdfAccessRequest>) => {
  try {
    let rejectInstantiation!: (error: unknown) => void;
    const instantiationFailed = new Promise<never>((_, reject) => {
      rejectInstantiation = reject;
    });
    const options: Partial<PdfiumModule> & {
      wasmBinary?: ArrayBuffer;
      instantiateWasm?: (
        imports: WebAssembly.Imports,
        ready: (
          instance: WebAssembly.Instance,
          module: WebAssembly.Module,
        ) => void,
      ) => void;
    } = {};
    const precompiled = data.wasmModule;
    if (precompiled) {
      options.instantiateWasm = (imports, ready) => {
        void WebAssembly.instantiate(precompiled, imports)
          .then((instance) => ready(instance, precompiled))
          .catch(rejectInstantiation);
      };
    } else {
      const response = await fetch(data.wasmUrl);
      if (!response.ok) throw new Error("Unable to load PDF security reader");
      options.wasmBinary = await response.arrayBuffer();
    }
    const module = await Promise.race([init(options), instantiationFailed]);
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
