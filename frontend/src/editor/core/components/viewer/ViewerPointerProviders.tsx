import { useEffect, useState, type ReactNode } from "react";
import {
  GlobalPointerProvider,
  PagePointerProvider,
  useInteractionManagerCapability,
} from "@embedpdf/plugin-interaction-manager/react";

// Must stay equal to the interaction manager's own default mode id: when it matches,
// data-viewer-touch-scroll is "on" and the touch-action rule in core/styles/theme.css
// lets a one-finger drag scroll the document. Pinned by viewerPanConfig.test.ts.
export const POINTER_MODE = "pointerMode";

/** Class on every page's pointer layer; the touch-action rule in core/styles/theme.css selects on it too. */
export const PAGE_POINTER_LAYER_CLASS = "pdf-page-pointer-layer";

/**
 * Commits an in-progress polyline or polygon. EmbedPDF finishes those shapes
 * only on a double-click, which it reads off the page pointer layer; pages with
 * no shape in progress ignore the event.
 */
export function finishPendingPageShape(): void {
  document
    .querySelectorAll(`.${PAGE_POINTER_LAYER_CLASS}`)
    .forEach((layer) =>
      layer.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
      ),
    );
}

function useActiveInteractionMode(documentId: string): string | null {
  const { provides: interactionManager } = useInteractionManagerCapability();
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    if (!interactionManager) return;
    const scope = interactionManager.forDocument(documentId);
    setMode(scope.getActiveInteractionMode()?.id ?? null);
    return scope.onModeChange((next) => setMode(next));
  }, [interactionManager, documentId]);

  return mode;
}

export function ViewerGlobalPointerProvider({
  documentId,
  children,
}: {
  documentId: string;
  children: ReactNode;
}) {
  const mode = useActiveInteractionMode(documentId);

  return (
    <GlobalPointerProvider
      documentId={documentId}
      // Consumed by the touch-action rule in core/styles/theme.css.
      data-viewer-touch-scroll={mode === POINTER_MODE ? "on" : "off"}
    >
      {children}
    </GlobalPointerProvider>
  );
}

export function ViewerPagePointerProvider({
  documentId,
  pageIndex,
  children,
}: {
  documentId: string;
  pageIndex: number;
  children: ReactNode;
}) {
  return (
    <PagePointerProvider
      documentId={documentId}
      pageIndex={pageIndex}
      // Consumed by the touch-action rule in core/styles/theme.css.
      className={PAGE_POINTER_LAYER_CLASS}
    >
      {children}
    </PagePointerProvider>
  );
}
