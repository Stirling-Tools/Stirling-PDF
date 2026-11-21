import { useEffect, useSyncExternalStore } from "react";
import { setDocumentLoaded } from "@embedpdf/core";
import { useRegistry } from "@embedpdf/core/react";
import type { PdfDocumentObject, PdfPageObject } from "@embedpdf/models";
import type {
  ViewerLayoutPage,
  ViewerPageLayout,
} from "@editor/contexts/viewer/ViewerPageTool";

const NO_LAYOUT = () => () => undefined;

export function useToolOwnsPages(layout: ViewerPageLayout | null): boolean {
  return useSyncExternalStore(layout ? layout.subscribe : NO_LAYOUT, () =>
    layout ? layout.pages() !== null : false,
  );
}

function laidOut(
  file: PdfDocumentObject,
  pages: readonly ViewerLayoutPage[],
): PdfPageObject[] {
  return pages.map((page, index) => {
    const sideways = page.quarterTurns % 2 === 1;
    return {
      ...file.pages[Math.min(index, file.pages.length - 1)],
      index,
      size: sideways
        ? { width: page.height, height: page.width }
        : { width: page.width, height: page.height },
      rotation: page.quarterTurns,
    };
  });
}

export function PageLayoutBridge({
  documentId,
  layout,
}: {
  documentId: string;
  layout: ViewerPageLayout | null;
}) {
  const { registry } = useRegistry();
  useEffect(() => {
    if (!registry || !layout) return;
    const store = registry.getStore();
    let filePages: PdfDocumentObject | null = null;
    let shownPages: PdfPageObject[] | null = null;
    let shownLayout: readonly ViewerLayoutPage[] | null = null;
    const loadedDocument = () => {
      const state = store.getState().core.documents[documentId];
      return state?.status === "loaded" ? (state.document ?? null) : null;
    };
    const ours = (document: PdfDocumentObject) =>
      shownPages !== null && document.pages === shownPages;
    const restore = () => {
      const file = filePages;
      shownPages = null;
      shownLayout = null;
      if (!file) return;
      store.dispatch(setDocumentLoaded(documentId, file));
    };
    const apply = () => {
      const current = loadedDocument();
      if (!current) return;
      if (!ours(current)) {
        filePages = current;
        shownPages = null;
        shownLayout = null;
      }
      const file = filePages;
      if (!file) return;
      const pages = layout.pages();
      if (!pages) {
        if (ours(current)) restore();
        return;
      }
      if (pages === shownLayout && ours(current)) return;
      shownLayout = pages;
      shownPages = laidOut(file, pages);
      store.dispatch(
        setDocumentLoaded(documentId, {
          ...current,
          pageCount: shownPages.length,
          pages: shownPages,
        }),
      );
    };
    apply();
    const unsubscribeLayout = layout.subscribe(apply);
    const unsubscribeStore = store.subscribe(() => {
      const current = loadedDocument();
      if (current && !ours(current) && layout.pages()) apply();
    });
    return () => {
      unsubscribeLayout();
      unsubscribeStore();
      const current = loadedDocument();
      if (current && ours(current)) restore();
    };
  }, [registry, layout, documentId]);
  return null;
}
