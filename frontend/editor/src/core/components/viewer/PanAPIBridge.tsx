import { useEffect, useRef } from "react";
import { usePan } from "@embedpdf/plugin-pan/react";
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react";
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
  const { provides: imCapability } = useInteractionManagerCapability();
  const { registerBridge, triggerImmediatePanUpdate } = useViewer();

  // Keep refs updated to avoid re-running effect when object references change
  const panRef = useRef(pan);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  const imRef = useRef(imCapability);
  useEffect(() => {
    imRef.current = imCapability;
  }, [imCapability]);

  // Track previous isPanning value to detect changes
  const prevIsPanningRef = useRef<boolean>(isPanning);

  useEffect(() => {
    const currentPan = panRef.current;
    if (currentPan) {
      const newState = {
        isPanning,
      };

      // Pan off must always land in selection (pointerMode), not the default mode -
      // if pan ever became the default, disablePan/togglePan couldn't escape it (#5175).
      const goToPointerMode = () => {
        const im = imRef.current;
        if (im) {
          im.forDocument(documentId).activate("pointerMode");
        } else {
          currentPan.disablePan();
        }
      };

      // Register this bridge with ViewerContext
      registerBridge("pan", {
        state: newState,
        api: {
          enable: () => {
            currentPan.enablePan();
          },
          disable: () => {
            goToPointerMode();
          },
          toggle: () => {
            if (isPanning) {
              goToPointerMode();
            } else {
              currentPan.enablePan();
            }
          },
          makePanDefault: () => {
            // Never make pan the default mode (that is what locks the viewer in
            // #5175). Just enable pan for the current interaction.
            currentPan.enablePan();
          },
        },
      });

      if (prevIsPanningRef.current !== isPanning) {
        prevIsPanningRef.current = isPanning;
        triggerImmediatePanUpdate(isPanning);
      }
    }

    return () => {
      registerBridge("pan", null);
    };
  }, [isPanning, registerBridge, triggerImmediatePanUpdate, documentId]);

  return null;
}
