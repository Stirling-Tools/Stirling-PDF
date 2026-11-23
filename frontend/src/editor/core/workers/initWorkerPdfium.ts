import {
  init,
  type PdfiumModule,
  type WrappedPdfiumModule,
} from "@embedpdf/pdfium";

/** Starts PDFium inside a worker, reusing the page's compiled module when the
 *  browser could clone it, and fetching the WASM itself otherwise. */
export async function initWorkerPdfium(
  wasmUrl: string,
  wasmModule: WebAssembly.Module | null,
): Promise<WrappedPdfiumModule> {
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
  if (wasmModule) {
    // `instantiateWasm` reports success by callback, so a rejection inside it
    // must reach the race below or init() would never settle.
    options.instantiateWasm = (imports, ready) => {
      void WebAssembly.instantiate(wasmModule, imports)
        .then((instance) => ready(instance, wasmModule))
        .catch(rejectInstantiation);
    };
  } else {
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error("Unable to load the PDF engine");
    options.wasmBinary = await response.arrayBuffer();
  }
  const module = await Promise.race([init(options), instantiationFailed]);
  module.PDFiumExt_Init();
  return module;
}
