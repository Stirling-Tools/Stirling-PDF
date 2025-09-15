import { useEffect, useRef } from 'react';
import { useZoom } from '@embedpdf/plugin-zoom/react';

/**
 * Component that runs inside EmbedPDF context and exports zoom controls globally
 */
export function ZoomAPIBridge() {
  const { provides: zoom, state: zoomState } = useZoom();
  const hasSetInitialZoom = useRef(false);

  // Set initial zoom once when plugin is ready
  useEffect(() => {
    if (zoom && !hasSetInitialZoom.current) {
      hasSetInitialZoom.current = true;
      setTimeout(() => {
        console.log('Setting initial zoom to 140%');
        zoom.requestZoom(1.4);
      }, 50);
    }
  }, [zoom]);

  useEffect(() => {
    if (zoom) {

      // Export zoom controls to global window for right rail access
      (window as any).embedPdfZoom = {
        zoomIn: () => zoom.zoomIn(),
        zoomOut: () => zoom.zoomOut(),
        toggleMarqueeZoom: () => zoom.toggleMarqueeZoom(),
        requestZoom: (level: any) => zoom.requestZoom(level),
        currentZoom: zoomState?.currentZoomLevel || 1.4,
        zoomPercent: Math.round((zoomState?.currentZoomLevel || 1.4) * 100),
      };

    }
  }, [zoom, zoomState]);

  return null;
}
