/**
 * Thumbnail and page-metadata rendering off the main thread. The worker owns
 * its PDFium heap: terminating it is the only way that memory is returned, so
 * the client shuts it down when idle.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { initWorkerPdfium } from "@editor/workers/initWorkerPdfium";
import {
  closeMemoryDocument,
  openMemoryDocument,
  PdfiumOpenFailure,
  renderFirstPage,
  renderPageDataUrl,
  type FirstPageRender,
  type MemoryDocument,
  type RenderPdfiumPageOptions,
} from "@editor/utils/pdfiumRenderCore";

export type PdfRenderRequest =
  | {
      id: number;
      type: "init";
      wasmUrl: string;
      wasmModule: WebAssembly.Module | null;
    }
  | {
      id: number;
      type: "firstPage";
      source: Blob;
      password: string;
      scale: number;
      render: Omit<RenderPdfiumPageOptions, "applyRotation">;
      modes: Array<"unrotated" | "rotated">;
      allPagesMetadata: boolean;
    }
  | {
      id: number;
      type: "pages";
      /** Identifies the document across calls, so its parse is reused. */
      key: string;
      source: Blob;
      password: string;
      /** 1-based page numbers. */
      pages: number[];
      scale: number;
      render: RenderPdfiumPageOptions;
    }
  | { id: number; type: "release"; key: string };

export interface PageRender {
  pageNumber: number;
  thumbnail: string | null;
  error?: string;
}

export type PdfRenderResponse =
  | {
      id: number;
      ok: true;
      result?: FirstPageRender | PageRender[];
    }
  | {
      id: number;
      ok: false;
      message: string;
      openErrorCode?: number;
      /** Bytes the worker read before PDFium rejected them: a short read says
       *  nothing about the file, so damage is only judged against a full one. */
      bytesRead?: number;
    };

/** Documents kept open for the page editor; each holds a whole file in the heap. */
const MAX_OPEN_DOCUMENTS = 3;

let modulePromise: Promise<WrappedPdfiumModule> | null = null;
let wasm: { url: string; module: WebAssembly.Module | null } | null = null;
const openDocuments = new Map<string, { doc: MemoryDocument; source: Blob }>();

function pdfium(): Promise<WrappedPdfiumModule> {
  if (!wasm) throw new Error("PDF render worker used before init");
  modulePromise ??= initWorkerPdfium(wasm.url, wasm.module);
  return modulePromise;
}

async function readBytes(source: Blob): Promise<Uint8Array> {
  return new Uint8Array(await source.arrayBuffer());
}

function closeDocument(m: WrappedPdfiumModule, key: string): void {
  const entry = openDocuments.get(key);
  if (!entry) return;
  openDocuments.delete(key);
  closeMemoryDocument(m, entry.doc);
}

async function documentFor(
  m: WrappedPdfiumModule,
  key: string,
  source: Blob,
  password: string,
): Promise<MemoryDocument> {
  const cached = openDocuments.get(key);
  // Same key, different bytes (a version replaced in place): reopen.
  if (cached && cached.source.size === source.size) {
    openDocuments.delete(key);
    openDocuments.set(key, cached); // most recently used last
    return cached.doc;
  }
  if (cached) closeDocument(m, key);
  while (openDocuments.size >= MAX_OPEN_DOCUMENTS) {
    const oldest = openDocuments.keys().next().value;
    if (oldest === undefined) break;
    closeDocument(m, oldest);
  }
  const doc = openMemoryDocument(m, await readBytes(source), password);
  openDocuments.set(key, { doc, source });
  return doc;
}

async function handle(
  request: PdfRenderRequest,
): Promise<FirstPageRender | PageRender[] | undefined> {
  switch (request.type) {
    case "init":
      wasm = { url: request.wasmUrl, module: request.wasmModule };
      return undefined;
    case "firstPage": {
      const m = await pdfium();
      const bytes = await readBytes(request.source);
      let doc: MemoryDocument;
      try {
        doc = openMemoryDocument(m, bytes, request.password);
      } catch (error) {
        if (error instanceof PdfiumOpenFailure) error.bytesRead = bytes.length;
        throw error;
      }
      try {
        return await renderFirstPage(
          m,
          doc.docPtr,
          request.scale,
          request.render,
          request.modes,
          request.allPagesMetadata,
        );
      } finally {
        closeMemoryDocument(m, doc);
      }
    }
    case "pages": {
      const m = await pdfium();
      const doc = await documentFor(
        m,
        request.key,
        request.source,
        request.password,
      );
      const results: PageRender[] = [];
      for (const pageNumber of request.pages) {
        try {
          const thumbnail = await renderPageDataUrl(
            m,
            doc.docPtr,
            pageNumber - 1,
            request.scale,
            request.render,
          );
          results.push({ pageNumber, thumbnail });
        } catch (error) {
          results.push({
            pageNumber,
            thumbnail: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return results;
    }
    case "release": {
      if (modulePromise) closeDocument(await modulePromise, request.key);
      return undefined;
    }
  }
}

// One job at a time: a document evicted for one request must never be one
// another request is still rendering from.
let queue: Promise<unknown> = Promise.resolve();

self.onmessage = ({ data }: MessageEvent<PdfRenderRequest>) => {
  queue = queue.then(async () => {
    let response: PdfRenderResponse;
    try {
      response = { id: data.id, ok: true, result: await handle(data) };
    } catch (error) {
      response = {
        id: data.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        openErrorCode:
          error instanceof PdfiumOpenFailure ? error.code : undefined,
        bytesRead:
          error instanceof PdfiumOpenFailure ? error.bytesRead : undefined,
      };
    }
    self.postMessage(response);
  });
};
