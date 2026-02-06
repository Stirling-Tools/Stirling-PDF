import { useEffect, useRef } from 'react';
import { usePan } from '@embedpdf/plugin-pan/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';

export function PanAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  
  // Don't render the inner component until we have a valid document ID
  if (!activeDocumentId) {
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
  
  // Track previous isPanning value to detect changes
  const prevIsPanningRef = useRef<boolean>(isPanning);

  useEffect(() => {
    const currentPan = panRef.current;
    if (currentPan) {
      const newState = {
        isPanning
      };

      // Register this bridge with ViewerContext
      registerBridge('pan', {
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
          makePanDefault: () => {
            // v2.5.0: makePanDefault may not exist, enable pan as fallback
            if ('makePanDefault' in currentPan && typeof (currentPan as any).makePanDefault === 'function') {
              (currentPan as any).makePanDefault();
            } else {
              currentPan.enablePan();
            }
          },
        }
      });
      
      // Trigger immediate pan update if the value changed
      if (prevIsPanningRef.current !== isPanning) {
        prevIsPanningRef.current = isPanning;
        triggerImmediatePanUpdate(isPanning);
      }
    }
  }, [isPanning, registerBridge, triggerImmediatePanUpdate]);

  return null;
}
