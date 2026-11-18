import { useEffect } from "react";
import { useInteractionManagerCapability } from "@embedpdf/plugin-interaction-manager/react";

/**
 * Holds the viewer's own pointer interactions paused while `active`, so a tool
 * drawing or editing on the pages never also selects the text underneath.
 *
 * Mount once per document, not per page: page overlays live inside a
 * virtualising Scroller, so one scrolling out of view would otherwise resume
 * mid-session. Never flip `active` mid-gesture: pausing between a pointerdown
 * and its pointerup strands the selection, which then keeps extending on every
 * move once resumed.
 */
export function ViewerInteractionLock({ active }: { active: boolean }) {
  const { provides: interactionManager } = useInteractionManagerCapability();
  useEffect(() => {
    if (!active || !interactionManager) return undefined;
    interactionManager.pause();
    return () => interactionManager.resume();
  }, [active, interactionManager]);
  return null;
}
