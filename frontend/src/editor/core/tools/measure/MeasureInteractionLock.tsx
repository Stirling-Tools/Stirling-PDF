import { useEffect } from "react";
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react";
import { useMeasurements } from "@editor/contexts/MeasurementContext";
import { useViewerIsPanning } from "@editor/components/viewer/useViewerIsPanning";

/**
 * Pauses the viewer's own pointer handling while the Measure tool is drawing,
 * so clicks on the page place points instead of selecting annotations or
 * text. Pan mode keeps it running, since panning is the viewer's.
 *
 * Mounted once per document inside EmbedPDF; the measurement overlay listens
 * to the page container itself.
 */
export function MeasureInteractionLock() {
  const { isToolOpen } = useMeasurements();
  const isPanning = useViewerIsPanning();
  const { provides: interactionManager } = useInteractionManagerCapability();
  const armed = isToolOpen && !isPanning;

  useEffect(() => {
    if (!armed || !interactionManager) return undefined;
    interactionManager.pause();
    return () => interactionManager.resume();
  }, [armed, interactionManager]);

  return null;
}
