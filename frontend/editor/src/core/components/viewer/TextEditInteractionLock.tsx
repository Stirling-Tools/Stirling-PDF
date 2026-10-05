import { useEffect } from "react";
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react";

/**
 * Pauses the viewer's own pointer interactions while text editing owns the
 * pages, so a press on an editable run never also starts a text selection.
 * Mounted once per document: page layers virtualise and would resume mid-edit.
 */
export function TextEditInteractionLock({ active }: { active: boolean }) {
  const { provides: interactionManager } = useInteractionManagerCapability();
  useEffect(() => {
    if (!active || !interactionManager) return undefined;
    interactionManager.pause();
    return () => interactionManager.resume();
  }, [active, interactionManager]);
  return null;
}
