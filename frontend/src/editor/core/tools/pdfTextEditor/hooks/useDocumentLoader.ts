import { useCallback } from "react";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  FPDF_ERR_PASSWORD,
  PdfiumOpenError,
} from "@editor/services/pdfiumService";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  getPdfAccess,
  rememberPdfAccess,
} from "@editor/services/pdfAccessService";
import { assertPdfSessionEditable } from "@editor/services/pdfSessionUnlock";
import { readPdfiumAccess } from "@editor/utils/pdfiumAccess";

const EAGER_PAGE_LIMIT = 5;
/** Work this long before letting the browser paint. */
const BACKGROUND_SLICE_MS = 50;

/** Yield to the event loop so the React layer can paint progress. */
const yieldToBrowser = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Open a PDF in PDFium and lazily populate pages on first visibility. */
export function useDocumentLoader(store: EditorStore) {
  return useCallback(
    async (file: File, password?: string): Promise<void> => {
      const documentPassword = password ?? getPdfAccess(file)?.password;
      const token = store.beginLoad();
      store.setLoading(true);
      store.setProgress({
        stage: `Reading ${file.name}`,
        current: 0,
        total: 0,
      });
      try {
        await yieldToBrowser();
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!store.isCurrentLoad(token)) return;
        store.setProgress({
          stage: "Parsing PDF",
          current: 0,
          total: 0,
        });
        await yieldToBrowser();
        const doc = await EditorDocument.open(bytes, documentPassword);
        try {
          if (!store.isCurrentLoad(token)) {
            doc.dispose();
            return;
          }
          const access = rememberPdfAccess(
            file,
            readPdfiumAccess(doc.module, doc.docPtr, documentPassword ?? ""),
          );
          assertPdfSessionEditable(access);
        } catch (error) {
          doc.dispose();
          throw error;
        }
        if (!store.isCurrentLoad(token)) {
          // A newer load superseded us before we installed our doc - free
          // it ourselves (setDocument never took ownership).
          try {
            doc.dispose();
          } catch {
            /* best-effort */
          }
          return;
        }
        await store.setDocument(doc);

        const total = doc.pageCount;
        const eager = Math.min(EAGER_PAGE_LIMIT, total);
        const snapshots: PageSnapshot[] = [];
        for (let i = 0; i < eager; i++) {
          store.setProgress({
            stage: `Reading page ${i + 1} of ${total}`,
            current: i,
            total,
          });
          await yieldToBrowser();
          // The check + synchronous read below run in one tick, so a
          // superseding load can only interpose here.
          if (!store.isCurrentLoad(token)) return;
          const page = doc.page(i);
          PdfiumTextReader.populate(doc, page, store.groupingMode);
          snapshots.push({
            pageIndex: i,
            width: page.width,
            height: page.height,
            dirty: false,
            revision: page.revision,
            runs: page.runs.map((r) => r.snapshot()),
            images: page.images.map((img) => img.snapshot()),
            shapes: page.shapes.map((shape) => shape.snapshot()),
            annotations: page.annotations,
            rules: page.rules,
            display: page.display.toData(),
          });
        }
        for (let i = eager; i < total; i++) {
          const page = doc.page(i);
          snapshots.push({
            pageIndex: i,
            width: page.width,
            height: page.height,
            dirty: false,
            revision: 0,
            runs: [],
            images: [],
            shapes: [],
            display: page.display.toData(),
          });
        }
        if (!store.isCurrentLoad(token)) return;
        store.publishPages(snapshots);
        store.setProgress({
          stage: "Ready",
          current: total,
          total,
        });
      } catch (err) {
        if (store.isCurrentLoad(token)) {
          // A password-protected PDF isn't a hard error.
          if (
            err instanceof PdfiumOpenError &&
            err.code === FPDF_ERR_PASSWORD
          ) {
            store.setPasswordRequired(file, documentPassword !== undefined);
          } else {
            store.setError(err instanceof Error ? err.message : String(err));
          }
        }
      } finally {
        // Only the winning load owns the loading/progress UI state.
        if (store.isCurrentLoad(token)) {
          store.setLoading(false);
          store.setProgress(null);
        }
      }
    },
    [store],
  );
}

/** Read EVERY not-yet-loaded page in one pass and publish once. */
export function ensureAllPagesRead(store: EditorStore): void {
  const doc = store.document;
  if (!doc) return;
  let any = false;
  for (const p of store.getState().pages) {
    any = readPage(store, doc, p.pageIndex) || any;
  }
  if (any) publishAllPages(store);
}

/**
 * ensureAllPagesRead without blocking: reads a slice at a time, yielding
 * between slices, and publishes when done or cancelled. The returned function
 * cancels; it is safe to call after the read has finished.
 */
export function readAllPagesInBackground(store: EditorStore): () => void {
  let cancelled = false;
  void (async () => {
    const doc = store.document;
    if (!doc) return;
    const pending = store
      .getState()
      .pages.map((p) => p.pageIndex)
      .filter((i) => !doc.page(i).loaded);
    let any = false;
    // Yield before the first slice so whatever asked for the read paints first.
    let sliceStart = -Infinity;
    for (const pageIndex of pending) {
      if (performance.now() - sliceStart > BACKGROUND_SLICE_MS) {
        await yieldToBrowser();
        sliceStart = performance.now();
      }
      // A page read but never published would never get its overlays.
      if (cancelled || store.document !== doc) break;
      any = readPage(store, doc, pageIndex) || any;
    }
    if (any && store.document === doc) publishAllPages(store);
  })();
  return () => {
    cancelled = true;
  };
}

/** False when the page was already read or failed to read. */
function readPage(
  store: EditorStore,
  doc: EditorDocument,
  pageIndex: number,
): boolean {
  const page = doc.page(pageIndex);
  if (page.loaded) return false;
  try {
    // Lazy reads must surface failures like the eager path, not throw out of the observer.
    PdfiumTextReader.populate(doc, page, store.groupingMode);
    return true;
  } catch (err) {
    store.setError(err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Publish every page's snapshot as the document has it now. */
export function publishAllPages(store: EditorStore): void {
  const doc = store.document;
  if (!doc) return;
  const next = store.getState().pages.map((p) => {
    const page = doc.page(p.pageIndex);
    return {
      ...p,
      revision: page.revision,
      runs: page.runs.map((r) => r.snapshot()),
      images: page.images.map((img) => img.snapshot()),
      shapes: page.shapes.map((shape) => shape.snapshot()),
      annotations: page.annotations,
      rules: page.rules,
    };
  });
  store.publishPages(next);
}

/** Ensure a page's runs/images are loaded. */
export function ensurePageRead(store: EditorStore, pageIndex: number): void {
  const doc = store.document;
  if (!doc) return;
  const page = doc.page(pageIndex);
  if (page.loaded) return;
  try {
    // Lazy reads must surface failures like the eager path, not throw out of the observer.
    PdfiumTextReader.populate(doc, page, store.groupingMode);
  } catch (err) {
    store.setError(err instanceof Error ? err.message : String(err));
    return;
  }
  const state = store.getState();
  const next = state.pages.map((p) =>
    p.pageIndex === pageIndex
      ? {
          ...p,
          revision: page.revision,
          runs: page.runs.map((r) => r.snapshot()),
          images: page.images.map((img) => img.snapshot()),
          shapes: page.shapes.map((shape) => shape.snapshot()),
          annotations: page.annotations,
          rules: page.rules,
        }
      : p,
  );
  store.publishPages(next);
}
