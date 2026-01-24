import { useEffect, useState, useRef } from 'react';
import { usePan } from '@embedpdf/plugin-pan/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { DEFAULT_DOCUMENT_ID } from '@app/components/viewer/viewerConstants';

export function PanAPIBridge() {
  const { provides: pan, isPanning } = usePan(DEFAULT_DOCUMENT_ID);
  const { registerBridge, triggerImmediatePanUpdate } = useViewer();
  
  // Store state locally
  const [_localState, setLocalState] = useState({
    isPanning: false
  });
  
  // Track previous isPanning value to detect changes
  const prevIsPanningRef = useRef<boolean>(isPanning);

  useEffect(() => {
    if (pan) {
      // Update local state
      const newState = {
        isPanning
      };
      setLocalState(newState);

      // Register this bridge with ViewerContext
      registerBridge('pan', {
        state: newState,
        api: {
          enable: () => {
            pan.enablePan();
          },
          disable: () => {
            pan.disablePan();
          },
          toggle: () => {
            pan.togglePan();
          },
          makePanDefault: () => {
            // v2.3.0: makePanDefault may not exist, enable pan as fallback
            if ('makePanDefault' in pan && typeof (pan as any).makePanDefault === 'function') {
              (pan as any).makePanDefault();
            } else {
              pan.enablePan();
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
  }, [pan, isPanning, triggerImmediatePanUpdate]);

  return null;
}
