import { useEffect, useState, type ReactNode } from "react";
import {
  GlobalPointerProvider,
  PagePointerProvider,
  useInteractionManagerCapability,
} from "@embedpdf/plugin-interaction-manager/react";

const POINTER_MODE = "pointerMode";

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
      className="pdf-page-pointer-layer"
    >
      {children}
    </PagePointerProvider>
  );
}
