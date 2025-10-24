import { useEffect, useState } from 'react';
import { usePan } from '@embedpdf/plugin-pan/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * Component that runs inside EmbedPDF context and updates pan state in ViewerContext
 */
export function PanAPIBridge() {
  const { provides: pan, isPanning } = usePan();
  const { registerBridge } = useViewer();
  
  // Store state locally
  const [_localState, setLocalState] = useState({
    isPanning: false
  });

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
          makePanDefault: () => pan.makePanDefault(),
        }
      });
    }
  }, [pan, isPanning]);

  return null;
}
