import { useCallback } from "react";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
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
        store.publishPages(
          Array.from({ length: total }, (_, i) => unreadSnapshot(doc, i)),
        );
        store.setLoading(false);
        store.setProgress(null);
        // The first page's bitmap is what the user waits for; reading text first would queue it behind every eager page.
        await firstPagePainted(store);
        let any = false;
        for (let i = 0; i < Math.min(EAGER_PAGE_LIMIT, total); i++) {
          // One page per task: the paint that resolved the wait is still finishing in this one.
          await yieldToBrowser();
          if (!store.isCurrentLoad(token)) return;
          any = readPage(store, doc, i) || any;
        }
        if (any && store.isCurrentLoad(token)) publishAllPages(store);
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

// Opening every page just to size its placeholder parses each one; a long document then waits on all of them.
function unreadSnapshot(doc: EditorDocument, pageIndex: number): PageSnapshot {
  const { width, height } = doc.pageSize(pageIndex);
  return {
    pageIndex,
    width,
    height,
    dirty: false,
    revision: 0,
    runs: [],
    images: [],
    shapes: [],
    display: DisplayTransform.identity(width, height).toData(),
  };
}

/** A read page's snapshot; the placeholder before it carried no crop or rotation. */
function readSnapshot(
  previous: PageSnapshot,
  page: ReturnType<EditorDocument["page"]>,
): PageSnapshot {
  return {
    ...previous,
    width: page.width,
    height: page.height,
    display: page.display.toData(),
    revision: page.revision,
    runs: page.runs.map((r) => r.snapshot()),
    images: page.images.map((img) => img.snapshot()),
    shapes: page.shapes.map((shape) => shape.snapshot()),
    annotations: page.annotations,
    rules: page.rules,
  };
}

// Bounded: a page that never paints (hidden tab, render failure) must not hold back its text.
const FIRST_PAINT_WAIT_MS = 1500;

function firstPagePainted(store: EditorStore): Promise<void> {
  return new Promise((resolve) => {
    if (store.getState().firstPageRendered) return resolve();
    const timer = setTimeout(done, FIRST_PAINT_WAIT_MS);
    const unsubscribe = store.subscribe((state) => {
      if (state.firstPageRendered) done();
    });
    function done() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
  });
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
  const opened = new Map(doc.loadedPages().map((page) => [page.index, page]));
  const next = store.getState().pages.map((p) => {
    const page = opened.get(p.pageIndex);
    return page ? readSnapshot(p, page) : p;
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
  const next = store
    .getState()
    .pages.map((p) => (p.pageIndex === pageIndex ? readSnapshot(p, page) : p));
  store.publishPages(next);
}
