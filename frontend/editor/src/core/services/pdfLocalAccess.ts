import PdfAccessWorker from "@app/workers/pdfAccessWorker?worker";
import type {
  PdfAccessRequest,
  PdfAccessResponse,
} from "@app/workers/pdfAccessWorker";
import { pdfiumWasmUrl } from "@app/services/wasmPrecompiler";
import {
  getPdfAccess,
  pdfAccessLifetime,
  rememberPdfAccess,
  subscribePdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";

/** Authenticate locally without publishing credentials. Cancellation releases the worker and PDF bytes. */
export function inspectLocalPdfAccess(
  file: Blob,
  password = "",
  signal?: AbortSignal,
): Promise<PdfAccess> {
  if (signal?.aborted)
    return Promise.reject(
      new DOMException("Operation cancelled", "AbortError"),
    );
  return new Promise((resolve, reject) => {
    const generation = pdfAccessLifetime(file);
    const worker = new PdfAccessWorker();
    const finish = () => {
      worker.terminate();
      unsubscribe();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("Operation cancelled", "AbortError"));
    };
    const unsubscribe = subscribePdfAccess(() => {
      if (generation !== pdfAccessLifetime(file)) abort();
    });
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<PdfAccessResponse>) => {
      finish();
      if ("access" in data) resolve(data.access);
      else reject(Object.assign(new Error(data.error), { code: data.code }));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Unable to inspect PDF security locally"));
    };
    try {
      worker.postMessage({
        file,
        password,
        wasmUrl: pdfiumWasmUrl,
      } satisfies PdfAccessRequest);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}

/** Only used on admission/open; advanced protection operations request their own backend verification. */
export async function ensureLocalPdfAccess(
  file: Blob,
  signal?: AbortSignal,
  password?: string,
): Promise<PdfAccess> {
  if (signal?.aborted)
    throw new DOMException("Operation cancelled", "AbortError");
  const existing = getPdfAccess(file);
  if (existing && (password === undefined || password === existing.password))
    return existing;
  const generation = pdfAccessLifetime(file);
  const access = await inspectLocalPdfAccess(file, password ?? "", signal);
  if (signal?.aborted || generation !== pdfAccessLifetime(file))
    throw new DOMException("Session closed", "AbortError");
  const current = getPdfAccess(file);
  return current && current !== existing
    ? current
    : rememberPdfAccess(file, access);
}
