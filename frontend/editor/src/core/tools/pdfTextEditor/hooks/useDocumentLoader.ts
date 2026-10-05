import { useCallback } from "react";
import { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@app/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  FPDF_ERR_PASSWORD,
  PdfiumOpenError,
} from "@app/services/pdfiumService";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/types";
import { DisplayTransform } from "@app/tools/pdfTextEditor/model/DisplayTransform";
import {
  sharedEngineEnabled,
  viewerDocumentPtr,
} from "@app/services/sharedPdfiumEngine";

const EAGER_PAGE_LIMIT = 5;

/** Yield to the event loop so the React layer can paint progress. */
const yieldToBrowser = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Open a PDF in PDFium and lazily populate pages on first visibility. */
export function useDocumentLoader(store: EditorStore) {
  return useCallback(
    async (file: File, password?: string): Promise<void> => {
      // Each load claims a token.
      const token = store.beginLoad();
      store.setLoading(true);
      store.setProgress({
        stage: `Reading ${file.name}`,
        current: 0,
        total: 0,
      });
      try {
        await yieldToBrowser();
        const openStart = performance.now();
        // The viewer's own open document, when it runs on the shared module:
        // no second copy of the bytes, no second parse.
        const borrowed =
          sharedEngineEnabled() && password === undefined
            ? await viewerDocumentPtr((file as { fileId?: string }).fileId)
            : null;
        let doc: EditorDocument;
        if (borrowed) {
          doc = await EditorDocument.adopt(borrowed);
        } else {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!store.isCurrentLoad(token)) return;
          store.setProgress({
            stage: "Parsing PDF",
            current: 0,
            total: 0,
          });
          await yieldToBrowser();
          doc = await EditorDocument.open(bytes, password);
        }
        console.info(
          `[spike] editor document ${borrowed ? "adopted from viewer" : "opened"} in ${Math.round(performance.now() - openStart)}ms`,
        );
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
        const tSet = performance.now();
        await store.setDocument(doc);
        console.info(
          `[spike] setDocument ${Math.round(performance.now() - tSet)}ms`,
        );
        const tEager = performance.now();

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
            annotations: page.annotations,
            display: page.display.toData(),
          });
        }
        console.info(
          `[spike] eager ${eager} pages read in ${Math.round(performance.now() - tEager)}ms`,
        );
        const tRest = performance.now();
        // Unread pages are stubbed from their size alone; the real page (and
        // its crop/rotation transform) loads on first visibility.
        for (let i = eager; i < total; i++) {
          const size = doc.pageSize(i);
          snapshots.push({
            pageIndex: i,
            width: size.width,
            height: size.height,
            dirty: false,
            revision: 0,
            runs: [],
            images: [],
            display: DisplayTransform.identity(
              size.width,
              size.height,
            ).toData(),
          });
        }
        console.info(
          `[spike] ${total - eager} page stubs in ${Math.round(performance.now() - tRest)}ms`,
        );
        if (!store.isCurrentLoad(token)) return;
        const tPub = performance.now();
        store.publishPages(snapshots);
        console.info(
          `[spike] publishPages ${Math.round(performance.now() - tPub)}ms`,
        );
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
            store.setPasswordRequired(file, password !== undefined);
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
    const page = doc.page(p.pageIndex);
    if (page.loaded) continue;
    try {
      // Lazy reads must surface failures like the eager path, not throw out of the observer.
      PdfiumTextReader.populate(doc, page, store.groupingMode);
      any = true;
    } catch (err) {
      store.setError(err instanceof Error ? err.message : String(err));
    }
  }
  if (!any) return;
  const next = store.getState().pages.map((p) => {
    const page = doc.page(p.pageIndex);
    return {
      ...p,
      width: page.width,
      height: page.height,
      display: page.display.toData(),
      revision: page.revision,
      runs: page.runs.map((r) => r.snapshot()),
      images: page.images.map((img) => img.snapshot()),
      annotations: page.annotations,
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
          width: page.width,
          height: page.height,
          display: page.display.toData(),
          revision: page.revision,
          runs: page.runs.map((r) => r.snapshot()),
          images: page.images.map((img) => img.snapshot()),
          annotations: page.annotations,
        }
      : p,
  );
  store.publishPages(next);
}
