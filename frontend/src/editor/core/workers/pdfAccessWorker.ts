/**
 * The local PDF probe: one PDFium read of a file's bytes that answers every local check, so callers
 * never parse the same file twice. Scheduled, cached and cancelled by `services/pdfAccessService.ts`.
 *
 * A check is either blocking or background, and must say which:
 * - Blocking: decides what an action may do (encryption, permissions, opening password, `signed`
 *   for the signed-PDF edit block). Answered first as `access`; callers await only this. Keep each
 *   blocking check to facts PDFium has once the document is open, so the answer stays in milliseconds.
 * - Background: information only, never awaited by an action (signer, reason, whether each signature
 *   still matches the bytes). Sent after `access` from the same open document, and only when relevant.
 *   A check whose cost grows with file size (hashing every signed byte) runs only on request,
 *   through `verifyPdfSignatures`, never when a file is opened.
 *
 * Local signature results are integrity evidence, not identity: the signature value and certificate
 * chain are never verified here, so whether the signer is trusted needs the backend.
 * `readPdfiumSignatures` rearranges the file bytes in WASM memory while hashing and restores them;
 * nothing else may touch them until it resolves.
 *
 * Workers are reused only after small unencrypted files, because WASM memory never shrinks and freed
 * pages keep their contents; every other file gets a fresh worker, and a clean spare is started for the next.
 *
 * Other reads of the same bytes that belong in this probe, each a separate parse today:
 * - `components/viewer/pdfViewerAccess.ts` reads `signed` again from the viewer's own PDFium document.
 * - `services/fileAnalyzer.ts` opens the file with PDF.js for the page count and encryption.
 * - `utils/pdfEncryptionProbe.ts` scans the trailer for an encryption hint on upload.
 * Files are probed on first use (viewer open, tool preflight), so a tool can accept a signed file
 * that has not been opened yet and refuse it only at Run. Probing each PDF when it is added closes
 * that gap; it needs a size cap, since the whole file is copied into WASM memory.
 * Planned background checks (metadata, images, JavaScript, attachments, form fields) go here too,
 * with the same checks mirrored on the backend through JPDFium so both sides agree.
 */
import {
  init,
  type PdfiumModule,
  type WrappedPdfiumModule,
} from "@embedpdf/pdfium";
import { readPdfiumAccess } from "@editor/utils/pdfiumAccess";
import {
  readPdfiumSignatures,
  type PdfSignatureInfo,
} from "@editor/utils/pdfiumSignatures";
import type { PdfAccess } from "@editor/services/pdfAccessService";

export interface PdfAccessRequest {
  file: Blob;
  password: string;
  verifySignatures: boolean;
  wasmUrl: string;
  wasmModule: WebAssembly.Module | null;
}

export interface PdfAccessWarmup {
  warmup: true;
  wasmUrl: string;
  wasmModule: WebAssembly.Module | null;
}

export type PdfAccessResponse =
  | { access: PdfAccess }
  | { signatures: PdfSignatureInfo[] }
  | { error: string; code?: number };

let pdfium: Promise<WrappedPdfiumModule> | undefined;

async function loadPdfium(
  request: PdfAccessRequest | PdfAccessWarmup,
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
  const precompiled = request.wasmModule;
  if (precompiled) {
    options.instantiateWasm = (imports, ready) => {
      void WebAssembly.instantiate(precompiled, imports)
        .then((instance) => ready(instance, precompiled))
        .catch(rejectInstantiation);
    };
  } else {
    const response = await fetch(request.wasmUrl);
    if (!response.ok) throw new Error("Unable to load PDF security reader");
    options.wasmBinary = await response.arrayBuffer();
  }
  const module = await Promise.race([init(options), instantiationFailed]);
  module.PDFiumExt_Init();
  return module;
}

function heap(module: WrappedPdfiumModule): Uint8Array {
  return (module.pdfium as typeof module.pdfium & { HEAPU8: Uint8Array })
    .HEAPU8;
}

async function copyIntoHeap(
  module: WrappedPdfiumModule,
  file: Blob,
  pointer: number,
) {
  const reader = file.stream().getReader();
  let offset = pointer;
  for (
    let chunk = await reader.read();
    !chunk.done;
    chunk = await reader.read()
  ) {
    heap(module).set(chunk.value, offset);
    offset += chunk.value.length;
  }
}

self.onmessage = async ({
  data,
}: MessageEvent<PdfAccessRequest | PdfAccessWarmup>) => {
  if ("warmup" in data) {
    pdfium ??= loadPdfium(data);
    await pdfium.catch(() => {
      pdfium = undefined;
    });
    return;
  }
  try {
    pdfium ??= loadPdfium(data);
    const module = await pdfium.catch((error: unknown) => {
      pdfium = undefined;
      throw error;
    });
    const length = data.file.size;
    const pointer = module.pdfium.wasmExports.malloc(Math.max(length, 1));
    if (!pointer) throw new Error("Unable to allocate memory for this PDF");
    try {
      await copyIntoHeap(module, data.file, pointer);
      const document = module.FPDF_LoadMemDocument(
        pointer,
        length,
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
          const empty = module.FPDF_LoadMemDocument(pointer, length, "");
          if (empty) module.FPDF_CloseDocument(empty);
          else if (module.FPDF_GetLastError() !== 4)
            throw new Error("Unable to verify the PDF opening password");
          access.requiresOpeningPassword = !empty;
        }
        self.postMessage({ access } satisfies PdfAccessResponse);
        if (access.signed)
          self.postMessage({
            signatures: await readPdfiumSignatures(
              module,
              document,
              { pointer, length },
              data.verifySignatures,
            ),
          } satisfies PdfAccessResponse);
      } finally {
        module.FPDF_CloseDocument(document);
      }
    } finally {
      heap(module).fill(0, pointer, pointer + length);
      module.pdfium.wasmExports.free(pointer);
    }
  } catch {
    self.postMessage({
      error: "Unable to inspect PDF security locally",
    } satisfies PdfAccessResponse);
  }
};
