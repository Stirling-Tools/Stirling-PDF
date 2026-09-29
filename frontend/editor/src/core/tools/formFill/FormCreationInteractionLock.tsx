/**
 * Holds the viewer's interactions paused for as long as the create tool is armed, so drawing a
 * field never also selects the text underneath.
 */
import { useEffect } from "react";
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react";

import { useFormFill } from "@app/tools/formFill/FormFillContext";

export function FormCreationInteractionLock() {
  const { mode, creationType } = useFormFill();
  const { provides: interactionManager } = useInteractionManagerCapability();
  const armed = mode === "create" && creationType != null;

  // Mounted once per document, not per page: the page overlays live inside a virtualising
  // Scroller, so one scrolling out of view would otherwise resume mid-session.
  useEffect(() => {
    if (!armed || !interactionManager) return undefined;
    // Never paused mid-gesture: pausing between a pointerdown and its pointerup strands the
    // selection, which then keeps extending on every move once resumed.
    interactionManager.pause();
    return () => interactionManager.resume();
  }, [armed, interactionManager]);

  return null;
}
