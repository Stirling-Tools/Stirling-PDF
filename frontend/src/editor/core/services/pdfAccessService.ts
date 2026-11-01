/** Owns session access, file lifetimes and local inspection. Credentials are never persisted. */
import type { FileId } from "@editor/types/file";
import { combineAbortSignals } from "@editor/utils/combineAbortSignals";
import PdfAccessWorker from "@editor/workers/pdfAccessWorker?worker";
import type {
  PdfAccessRequest,
  PdfAccessResponse,
} from "@editor/workers/pdfAccessWorker";
import {
  pdfiumWasmUrl,
  pdfiumWasmModulePromise,
  startEagerWasmCompilation,
} from "@editor/services/wasmPrecompiler";

/** Session-only access to encrypted bytes. Never serialize this object or include it in tool parameters. */
export interface PdfAccess {
  password: string;
  openingPassword?: string;
  openingAuthenticated?: boolean;
  encrypted: boolean;
  requiresOpeningPassword?: boolean;
  signed: boolean;
  ownerAuthenticated: boolean;
  /** Active instance policy; absent configuration defaults to enforcing restrictions. */
  honorOwnerPasswords?: boolean;
  permissions: number;
  encryptionRevision?: number;
  pageCount: number;
}

let accessByFile = new WeakMap<Blob, PdfAccess>();
let ownerPasswordPolicy: boolean | undefined;
let sessionLifetime = new AbortController();
let accessLifetimes = new WeakMap<
  Blob,
  { controller: AbortController; signal: AbortSignal }
>();
const filesById = new Map<string, WeakRef<Blob>>();
const listeners = new Set<() => void>();
let revision = 0;
/** Sets the active server policy for every access path; undefined releases the provider's policy. */
export function setPdfAccessPolicy(
  honorOwnerPasswords: boolean | undefined,
): void {
  if (ownerPasswordPolicy === honorOwnerPasswords) return;
  ownerPasswordPolicy = honorOwnerPasswords;
  publish();
}

/** Aborted by logout or FileContext teardown, independently of individual document closures. */
export function pdfAccessSessionLifetime(): AbortSignal {
  return sessionLifetime.signal;
}
/** Aborted by replacement, close or logout; also identifies the generation allowed to retain credentials. */
export function pdfAccessLifetime(file: Blob): AbortSignal {
  let lifetime = accessLifetimes.get(file);
  if (!lifetime) {
    const controller = new AbortController();
    lifetime = {
      controller,
      signal: combineAbortSignals([controller.signal, sessionLifetime.signal])
        .signal,
    };
    accessLifetimes.set(file, lifetime);
  }
  return lifetime.signal;
}

/** Only call after a parser or a protection-preserving export proves these bytes unencrypted. */
export function rememberUnencryptedPdf(
  file: Blob,
  pageCount: number,
): PdfAccess {
  return rememberPdfAccess(file, {
    password: "",
    encrypted: false,
    signed: false,
    ownerAuthenticated: false,
    permissions: -4,
    pageCount,
  });
}

/** For viewer exports that cannot add encryption; arbitrary tool outputs must inspect their own bytes. */
export function rememberPlainPdfExport(source: Blob, output: Blob): void {
  const access = getPdfAccess(source);
  if (access?.encrypted === false)
    rememberUnencryptedPdf(output, access.pageCount);
}

function publish(): void {
  revision++;
  for (const listener of listeners) listener();
}

/** Look up credentials for these exact bytes; a replacement with the same filename must unlock separately. */
export function getPdfAccess(
  file: Blob | string | null | undefined,
): PdfAccess | undefined {
  if (!file) return undefined;
  const blob = typeof file === "string" ? filesById.get(file)?.deref() : file;
  if (!blob) return undefined;
  let access = accessByFile.get(blob);
  if (
    access &&
    ownerPasswordPolicy !== undefined &&
    access.honorOwnerPasswords !== ownerPasswordPolicy
  ) {
    access = { ...access, honorOwnerPasswords: ownerPasswordPolicy };
    accessByFile.set(blob, access);
  }
  return access;
}

/** Retain access without changing the file; returns the identity used by preview cleanup. */
export function rememberPdfAccess(file: Blob, access: PdfAccess): PdfAccess {
  const previous = accessByFile.get(file);
  if (previous?.password === access.password) {
    access = {
      ...previous,
      ...access,
      honorOwnerPasswords:
        access.honorOwnerPasswords ?? previous.honorOwnerPasswords,
      openingAuthenticated:
        access.openingAuthenticated ?? previous.openingAuthenticated,
      requiresOpeningPassword:
        access.requiresOpeningPassword ?? previous.requiresOpeningPassword,
    };
  }
  const storedAccess = {
    ...access,
    honorOwnerPasswords: ownerPasswordPolicy ?? access.honorOwnerPasswords,
    openingPassword: access.encrypted
      ? access.openingAuthenticated || !access.ownerAuthenticated
        ? access.password
        : (access.openingPassword ?? accessByFile.get(file)?.openingPassword)
      : undefined,
  };
  accessByFile.set(file, storedAccess);
  if ("fileId" in file && typeof file.fileId === "string")
    filesById.set(file.fileId, new WeakRef(file));
  publish();
  return storedAccess;
}

/** Bind FileContext identity without retaining closed/library-only bytes; replacements invalidate pending access. */
export function bindPdfAccess(file: Blob, id: FileId): void {
  const previous = filesById.get(id)?.deref();
  if (previous && previous !== file) {
    accessByFile.delete(previous);
    accessLifetimes.get(previous)?.controller.abort();
    accessLifetimes.delete(previous);
    filesById.delete(id);
  }
  filesById.set(id, new WeakRef(file));
  if (previous && previous !== file) publish();
}

/** Closing a document drops its credential; reopening requires authentication again. */
export function forgetPdfAccess(ids: readonly string[]): void {
  for (const id of ids) {
    const file = filesById.get(id)?.deref();
    if (file) {
      accessByFile.delete(file);
      accessLifetimes.get(file)?.controller.abort();
      accessLifetimes.delete(file);
    }
    filesById.delete(id);
  }
  publish();
}

/** Drop preview-owned access unless the same bytes have since entered FileContext. */
export function forgetPreviewPdfAccess(file: Blob, access: PdfAccess): void {
  if (
    accessByFile.get(file) !== access ||
    [...filesById.values()].some((ref) => ref.deref() === file)
  )
    return;
  accessByFile.delete(file);
  accessLifetimes.get(file)?.controller.abort();
  accessLifetimes.delete(file);
  publish();
}

/** Clear all credentials on logout or FileContext teardown. */
export function clearPdfAccess(): void {
  sessionLifetime.abort();
  sessionLifetime = new AbortController();
  accessLifetimes = new WeakMap();
  accessByFile = new WeakMap();
  filesById.clear();
  publish();
}

/** Subscribe to unlock/lock changes without exposing credentials in React state. */
export function subscribePdfAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic snapshot for useSyncExternalStore. */
export function pdfAccessRevision(): number {
  return revision;
}

interface Inspection {
  controller: AbortController;
  promise: Promise<PdfAccess>;
  consumers: number;
}

const inspections = new WeakMap<Blob, Map<string, Inspection>>();
const INSPECTION_TIMEOUT_MS = 30_000;
const MAX_INSPECTION_WORKERS = 2;
// Each worker holds the input buffer and a WASM copy. Larger files run alone.
const INSPECTION_BYTE_BUDGET = 100 * 1024 * 1024;
const inspectionQueue: { size: number; start: () => void }[] = [];
let activeInspections = 0;
let inspectingBytes = 0;

function drainInspections(): void {
  while (inspectionQueue.length && activeInspections < MAX_INSPECTION_WORKERS) {
    const next = inspectionQueue[0];
    if (
      activeInspections &&
      inspectingBytes + next.size > INSPECTION_BYTE_BUDGET
    )
      return;
    inspectionQueue.shift();
    next.start();
  }
}

function runInspection(
  file: Blob,
  password: string,
  signal: AbortSignal,
): Promise<PdfAccess> {
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let started = false;
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      worker?.terminate();
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (started) {
        activeInspections--;
        inspectingBytes -= file.size;
      } else {
        const index = inspectionQueue.indexOf(queued);
        if (index !== -1) inspectionQueue.splice(index, 1);
      }
      drainInspections();
      return true;
    };
    const abort = () => {
      if (finish())
        reject(new DOMException("Operation cancelled", "AbortError"));
    };
    const queued = {
      size: file.size,
      start: () => {
        if (signal.aborted) {
          abort();
          return;
        }
        started = true;
        activeInspections++;
        inspectingBytes += file.size;
        timer = setTimeout(() => {
          if (finish())
            reject(
              new DOMException(
                "PDF permission inspection timed out. Try opening the file again.",
                "TimeoutError",
              ),
            );
        }, INSPECTION_TIMEOUT_MS);
        try {
          worker = new PdfAccessWorker();
          worker.onmessage = ({ data }: MessageEvent<PdfAccessResponse>) => {
            if (!finish()) return;
            if ("access" in data) resolve(data.access);
            else
              reject(Object.assign(new Error(data.error), { code: data.code }));
          };
          worker.onerror = () => {
            if (finish())
              reject(new Error("Unable to inspect PDF security locally"));
          };
          startEagerWasmCompilation();
          void pdfiumWasmModulePromise
            .then((wasmModule) => {
              if (finished) return;
              const request: PdfAccessRequest = {
                file,
                password,
                wasmUrl: pdfiumWasmUrl,
                wasmModule,
              };
              try {
                worker!.postMessage(request);
              } catch (error) {
                if (
                  !(error instanceof DOMException) ||
                  error.name !== "DataCloneError"
                )
                  throw error;
                // Some browsers cannot clone a compiled module into a worker.
                worker!.postMessage({ ...request, wasmModule: null });
              }
            })
            .catch((error: unknown) => {
              if (finish()) reject(error);
            });
        } catch (error) {
          if (finish()) reject(error);
        }
      },
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else {
      inspectionQueue.push(queued);
      drainInspections();
    }
  });
}

/** Authenticate without publishing credentials; concurrent readers share one worker per file and password. */
export function inspectLocalPdfAccess(
  file: Blob,
  password = "",
  signal?: AbortSignal,
): Promise<PdfAccess> {
  const lifetime = pdfAccessLifetime(file);
  const { signal: cancellation, dispose } = combineAbortSignals([
    lifetime,
    ...(signal ? [signal] : []),
  ]);
  if (cancellation.aborted) {
    dispose();
    return Promise.reject(
      new DOMException("Operation cancelled", "AbortError"),
    );
  }
  let pending = inspections.get(file);
  if (!pending) {
    pending = new Map();
    inspections.set(file, pending);
  }
  let inspection = pending.get(password);
  if (!inspection || inspection.controller.signal.aborted) {
    const controller = new AbortController();
    const combined = combineAbortSignals([controller.signal, lifetime]);
    const job: Inspection = {
      controller,
      consumers: 0,
      promise: runInspection(file, password, combined.signal).finally(() => {
        combined.dispose();
        if (pending.get(password) === job) pending.delete(password);
      }),
    };
    pending.set(password, job);
    inspection = job;
  }
  const job = inspection;
  job.consumers++;
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      cancellation.removeEventListener("abort", abort);
      dispose();
      if (--job.consumers === 0) job.controller.abort();
      return true;
    };
    const abort = () => {
      if (finish())
        reject(new DOMException("Operation cancelled", "AbortError"));
    };
    cancellation.addEventListener("abort", abort, { once: true });
    job.promise.then(
      (access) => {
        if (finish()) resolve(access);
      },
      (error) => {
        if (finish()) reject(error);
      },
    );
  });
}

/** Reuse access for these exact bytes and credentials, or inspect locally before publishing it. */
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
  const lifetime = pdfAccessLifetime(file);
  const access = await inspectLocalPdfAccess(file, password ?? "", signal);
  if (signal?.aborted || lifetime.aborted)
    throw new DOMException("Session closed", "AbortError");
  const current = getPdfAccess(file);
  return current && current !== existing
    ? current
    : rememberPdfAccess(file, access);
}
