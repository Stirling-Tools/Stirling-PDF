import { useEffect } from 'react';
import { useZoom } from '@embedpdf/plugin-zoom/react';

/**
 * Component that runs inside EmbedPDF context and exports zoom controls globally
 */
export function ZoomControlsExporter() {
  const { provides: zoom, state: zoomState } = useZoom();

  useEffect(() => {
    if (zoom) {
      // Export zoom controls to global window for right rail access
      (window as any).embedPdfZoom = {
        zoomIn: () => zoom.zoomIn(),
        zoomOut: () => zoom.zoomOut(),
        toggleMarqueeZoom: () => zoom.toggleMarqueeZoom(),
        requestZoom: (level: any) => zoom.requestZoom(level),
        currentZoom: zoomState?.currentZoomLevel || 1,
        zoomPercent: Math.round((zoomState?.currentZoomLevel || 1) * 100),
      };
      
    }
  }, [zoom, zoomState]);

  return null; // This component doesn't render anything
}