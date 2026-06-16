import { useCallback } from "react";
import { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { PdfiumTextReader } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumTextReader";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/v2/types";

const EAGER_PAGE_LIMIT = 5;

/**
 * Yield to the event loop so the React layer can paint progress.
 * Use setTimeout(0) directly - requestAnimationFrame can be throttled
 * to ~1Hz (or paused) in background tabs or embedded iframes (e.g.
 * the Claude preview tool), which would stall the loader.
 */
const yieldToBrowser = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Open a PDF in PDFium and lazily populate pages on first visibility.
 *
 * Reports detailed progress to the store so the React layer can paint a
 * "Loading page 3/60" overlay rather than freezing during the parse.
 * The eager pages (`EAGER_PAGE_LIMIT`) are read with a yield between
 * each page so the browser repaints the progress bar.
 */
export function useDocumentLoader(store: EditorStore) {
  return useCallback(
    async (file: File): Promise<void> => {
      // Each load claims a token. A newer load() bumps it, so this run can
      // detect after every await that it lost the race and bail - never
      // disposing or publishing over the document the newer load installed.
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
        const doc = await EditorDocument.open(bytes);
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
          // The check + synchronous read below run in one tick (no await
          // between), so a superseding load can only interpose here, before
          // we touch the possibly-disposed doc.
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
          store.setError(err instanceof Error ? err.message : String(err));
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

/**
 * Read EVERY not-yet-loaded page in one pass and publish once. Used by the
 * find bar so a search covers the whole document, not just the eager/
 * scrolled-into-view pages (otherwise find silently misses later pages).
 */
export function ensureAllPagesRead(store: EditorStore): void {
  const doc = store.document;
  if (!doc) return;
  let any = false;
  for (const p of store.getState().pages) {
    const page = doc.page(p.pageIndex);
    if (page.loaded) continue;
    PdfiumTextReader.populate(doc, page, store.groupingMode);
    any = true;
  }
  if (!any) return;
  const next = store.getState().pages.map((p) => {
    const page = doc.page(p.pageIndex);
    return {
      ...p,
      revision: page.revision,
      runs: page.runs.map((r) => r.snapshot()),
      images: page.images.map((img) => img.snapshot()),
    };
  });
  store.publishPages(next);
}

/**
 * Ensure a page's runs/images are loaded. Cheap no-op if already loaded.
 * Pushes the updated snapshot through the store so the React layer
 * re-renders that page with its overlays populated.
 */
export function ensurePageRead(store: EditorStore, pageIndex: number): void {
  const doc = store.document;
  if (!doc) return;
  const page = doc.page(pageIndex);
  if (page.loaded) return;
  PdfiumTextReader.populate(doc, page, store.groupingMode);
  const state = store.getState();
  const next = state.pages.map((p) =>
    p.pageIndex === pageIndex
      ? {
          ...p,
          revision: page.revision,
          runs: page.runs.map((r) => r.snapshot()),
          images: page.images.map((img) => img.snapshot()),
        }
      : p,
  );
  store.publishPages(next);
}
