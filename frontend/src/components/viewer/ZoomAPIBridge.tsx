import { useEffect, useRef } from 'react';
import { useZoom } from '@embedpdf/plugin-zoom/react';
import { useViewer } from '../../contexts/ViewerContext';

/**
 * Component that runs inside EmbedPDF context and manages zoom state locally
 */
export function ZoomAPIBridge() {
  const { provides: zoom, state: zoomState } = useZoom();
  const { registerBridge, triggerImmediateZoomUpdate } = useViewer();
  const hasSetInitialZoom = useRef(false);

  // Set initial zoom once when plugin is ready
  useEffect(() => {
    if (zoom && !hasSetInitialZoom.current) {
      hasSetInitialZoom.current = true;
      setTimeout(() => {
        zoom.requestZoom(1.4);
      }, 50);
    }
  }, [zoom]);

  useEffect(() => {
    if (zoom && zoomState) {
      // Update local state
      const currentZoomLevel = zoomState.currentZoomLevel || 1.4;
      const newState = {
        currentZoom: currentZoomLevel,
        zoomPercent: Math.round(currentZoomLevel * 100),
      };

      // Trigger immediate update for responsive UI
      triggerImmediateZoomUpdate(newState.zoomPercent);

      // Register this bridge with ViewerContext
      registerBridge('zoom', {
        state: newState,
        api: zoom
      });
    }
  }, [zoom, zoomState]);

  return null;
}
