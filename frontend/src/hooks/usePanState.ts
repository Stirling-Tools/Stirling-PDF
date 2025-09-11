import { useState, useEffect } from 'react';

/**
 * Hook to track EmbedPDF pan state for reactive UI components
 */
export function usePanState() {
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    // Subscribe to pan state changes
    const unsubscribe = (window as any).embedPdfPan?.onPanStateChange?.((newIsPanning: boolean) => {
      setIsPanning(newIsPanning);
    });

    // Get initial state
    if ((window as any).embedPdfPan?.isPanning !== undefined) {
      setIsPanning((window as any).embedPdfPan.isPanning);
    }

    return unsubscribe || (() => {});
  }, []);

  return isPanning;
}