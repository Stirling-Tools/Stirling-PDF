/**
 * Client for the PDF render worker. Rendering there keeps the main thread free
 * while files are added, and gives the PDFium heap a lifetime: WASM memory never
 * shrinks, so the worker is terminated once idle and its whole heap goes with it.
 */
import PdfRenderWorker from "@editor/workers/pdfRenderWorker?worker";
import type {
  PageRender,
  PdfRenderRequest,
  PdfRenderResponse,
} from "@editor/workers/pdfRenderWorker";
import type {
  FirstPageRender,
  RenderPdfiumPageOptions,
} from "@editor/utils/pdfiumRenderCore";
import { PdfiumOpenError } from "@editor/services/pdfiumService";
import {
  pdfiumWasmModulePromise,
  pdfiumWasmUrl,
  startEagerWasmCompilation,
} from "@editor/services/wasmPrecompiler";

/** Restarting costs ~30 ms (instantiating from the compiled module), while an
 *  idle worker holds the heap its largest document grew to, so it goes quickly. */
const IDLE_SHUTDOWN_MS = 5_000;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

type RequestBody = PdfRenderRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, "id">
    : never
  : never;

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let unavailable = false;

/** The worker could not be started in this page (a content security policy,
 *  or a browser that cannot run it); callers render on the main thread. */
export class RenderWorkerUnavailable extends Error {
  constructor(cause: unknown) {
    super("PDF render worker unavailable", { cause });
    this.name = "RenderWorkerUnavailable";
  }
}

/** jsdom and older browsers lack these, and a worker that failed to start once
 *  will not start later; callers then render on the main thread. */
export function canRenderInWorker(): boolean {
  return (
    !unavailable &&
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function"
  );
}

function shutdown(reason?: unknown): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
  worker?.terminate();
  worker = null;
  ready = null;
  for (const { reject } of pending.values()) {
    reject(reason ?? new Error("PDF render worker stopped"));
  }
  pending.clear();
}

function armIdleShutdown(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer =
    pending.size === 0 ? setTimeout(() => shutdown(), IDLE_SHUTDOWN_MS) : null;
}

function post(target: Worker, body: RequestBody): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
    try {
      target.postMessage({ ...body, id });
    } catch (error) {
      pending.delete(id);
      reject(error);
      armIdleShutdown();
    }
  });
}

function onResponse({ data }: MessageEvent<PdfRenderResponse>): void {
  const entry = pending.get(data.id);
  if (!entry) return;
  pending.delete(data.id);
  if (data.ok) entry.resolve(data.result);
  else if (data.openErrorCode !== undefined)
    entry.reject(
      Object.assign(new PdfiumOpenError(data.openErrorCode), {
        bytesRead: data.bytesRead,
      }),
    );
  else entry.reject(new Error(data.message));
  armIdleShutdown();
}

function startWorker(): { target: Worker; ready: Promise<void> } {
  if (worker && ready) return { target: worker, ready };
  let target: Worker;
  try {
    target = new PdfRenderWorker();
  } catch (error) {
    unavailable = true;
    throw new RenderWorkerUnavailable(error);
  }
  target.onmessage = onResponse;
  // A crash (including a WASM out-of-memory) takes this worker, not the tab;
  // the next request starts a fresh one.
  target.onerror = (event) => {
    if (worker === target)
      shutdown(new Error(event.message || "PDF render worker failed"));
  };
  worker = target;
  startEagerWasmCompilation();
  ready = pdfiumWasmModulePromise
    .then(async (wasmModule) => {
      try {
        await post(target, {
          type: "init",
          wasmUrl: pdfiumWasmUrl,
          wasmModule,
        });
      } catch (error) {
        // Some browsers cannot clone a compiled module into a worker.
        if (!(error instanceof DOMException) || error.name !== "DataCloneError")
          throw error;
        await post(target, {
          type: "init",
          wasmUrl: pdfiumWasmUrl,
          wasmModule: null,
        });
      }
    })
    .catch((error: unknown) => {
      unavailable = true;
      if (worker === target) shutdown(error);
      throw new RenderWorkerUnavailable(error);
    });
  return { target, ready };
}

/** Rejects with {@link RenderWorkerUnavailable} when the worker cannot start. */
async function request<T>(body: RequestBody): Promise<T> {
  const { target, ready: started } = startWorker();
  await started;
  return (await post(target, body)) as T;
}

/** Page 1 in the given rotation modes plus page metadata; rejects with
 *  {@link PdfiumOpenError} when PDFium cannot open the document. */
export function renderFirstPageInWorker(
  source: Blob,
  password: string,
  scale: number,
  render: Omit<RenderPdfiumPageOptions, "applyRotation">,
  modes: Array<"unrotated" | "rotated">,
  allPagesMetadata: boolean,
): Promise<FirstPageRender> {
  return request({
    type: "firstPage",
    source,
    password,
    scale,
    render,
    modes,
    allPagesMetadata,
  });
}

/** Renders pages of a document the worker keeps open under `key`. */
export function renderPagesInWorker(
  key: string,
  source: Blob,
  password: string,
  pages: number[],
  scale: number,
  render: RenderPdfiumPageOptions,
): Promise<PageRender[]> {
  return request({
    type: "pages",
    key,
    source,
    password,
    pages,
    scale,
    render,
  });
}

/** Closes a kept-open document; a stopped worker has nothing left to close. */
export function releaseWorkerDocument(key: string): void {
  if (!worker) return;
  void post(worker, { type: "release", key }).catch(() => {});
}
