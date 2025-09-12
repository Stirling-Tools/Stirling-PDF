import { useEffect, useState } from 'react';
import { usePan } from '@embedpdf/plugin-pan/react';

/**
 * Component that runs inside EmbedPDF context and bridges pan controls to global window
 */
export function PanAPIBridge() {
  const { provides: pan, isPanning } = usePan();
  const [panStateListeners, setPanStateListeners] = useState<Array<(isPanning: boolean) => void>>([]);

  useEffect(() => {
    if (pan) {
      // Export pan controls to global window for right rail access
      (window as any).embedPdfPan = {
        enablePan: () => {
          console.log('EmbedPDF: Enabling pan mode');
          pan.enablePan();
        },
        disablePan: () => {
          console.log('EmbedPDF: Disabling pan mode');
          pan.disablePan();
        },
        togglePan: () => {
          pan.togglePan();
        },
        makePanDefault: () => pan.makePanDefault(),
        get isPanning() { return isPanning; }, // Use getter to always return current value
        // Subscribe to pan state changes for reactive UI
        onPanStateChange: (callback: (isPanning: boolean) => void) => {
          setPanStateListeners(prev => [...prev, callback]);
          // Return unsubscribe function
          return () => {
            setPanStateListeners(prev => prev.filter(cb => cb !== callback));
          };
        },
      };

    } else {
      console.warn('EmbedPDF pan API not available yet');
    }
  }, [pan, isPanning]);

  // Notify all listeners when isPanning state changes
  useEffect(() => {
    panStateListeners.forEach(callback => callback(isPanning));
  }, [isPanning, panStateListeners]);

  return null;
}
