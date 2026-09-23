import { useEffect, useRef } from "react";
import { usePan } from "@embedpdf/plugin-pan/react";
import { useViewer } from "@app/contexts/ViewerContext";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";

/**
 * Connects the PDF pan (hand tool) plugin to the shared ViewerContext.
 */
export function PanAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();

  // Don't render the inner component until we have a valid document ID and the document is ready
  if (!activeDocumentId || !documentReady) {
    return null;
  }

  return <PanAPIBridgeInner documentId={activeDocumentId} />;
}

function PanAPIBridgeInner({ documentId }: { documentId: string }) {
  const { provides: pan, isPanning } = usePan(documentId);
  const { registerBridge, triggerImmediatePanUpdate } = useViewer();

  // Keep pan ref updated to avoid re-running effect when object reference changes
  const panRef = useRef(pan);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    const currentPan = panRef.current;
    if (currentPan) {
      const newState = {
        isPanning,
      };

      // Register this bridge with ViewerContext
      registerBridge("pan", {
        state: newState,
        api: {
          enable: () => {
            currentPan.enablePan();
          },
          disable: () => {
            currentPan.disablePan();
          },
          toggle: () => {
            currentPan.togglePan();
          },
        },
      });

      triggerImmediatePanUpdate(isPanning);
    }

    return () => {
      registerBridge("pan", null);
    };
  }, [isPanning, registerBridge, triggerImmediatePanUpdate]);

  useEffect(() => {
    return () => {
      triggerImmediatePanUpdate(false);
    };
  }, [triggerImmediatePanUpdate]);

  return null;
}
