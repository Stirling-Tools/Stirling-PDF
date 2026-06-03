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
      store.setLoading(true);
      store.setProgress({
        stage: `Reading ${file.name}`,
        current: 0,
        total: 0,
      });
      try {
        await yieldToBrowser();
        const bytes = new Uint8Array(await file.arrayBuffer());
        store.setProgress({
          stage: "Parsing PDF",
          current: 0,
          total: 0,
        });
        await yieldToBrowser();
        const doc = await EditorDocument.open(bytes);
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
        store.publishPages(snapshots);
        store.setProgress({
          stage: "Ready",
          current: total,
          total,
        });
      } catch (err) {
        store.setError(err instanceof Error ? err.message : String(err));
      } finally {
        store.setLoading(false);
        store.setProgress(null);
      }
    },
    [store],
  );
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
