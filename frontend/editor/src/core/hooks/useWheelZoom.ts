import { RefObject, useEffect } from "react";

interface UseWheelZoomOptions {
  /**
   * Element the wheel listener should be bound to.
   */
  ref: RefObject<Element | null>;
  /**
   * Callback executed when the hook decides to zoom in.
   */
  onZoomIn: () => void;
  /**
   * Callback executed when the hook decides to zoom out.
   */
  onZoomOut: () => void;
  /**
   * Whether the wheel listener should be active.
   */
  enabled?: boolean;
  /**
   * How much delta needs to accumulate before a zoom action is triggered.
   * Defaults to 10.
   */
  threshold?: number;
  /**
   * Whether a Ctrl/Cmd modifier is required for zooming. Defaults to true.
   */
  requireModifierKey?: boolean;
}

/**
 * Lightweight hook for handling wheel and trackpad pinch zoom on non-EmbedPDF
 * components (such as the Page Editor thumbnail view).
 */
export function useWheelZoom({
  ref,
  onZoomIn,
  onZoomOut,
  enabled = true,
  threshold = 10,
  requireModifierKey = true,
}: UseWheelZoomOptions) {
  useEffect(() => {
    if (!enabled) return;

    const element = ref.current;
    if (!element) return;

    let accumulator = 0;

    const handleWheel = (event: Event) => {
      const wheelEvent = event as WheelEvent;
      const hasModifier = wheelEvent.ctrlKey || wheelEvent.metaKey;
      if (requireModifierKey && !hasModifier) return;

      wheelEvent.preventDefault();
      wheelEvent.stopPropagation();

      accumulator += wheelEvent.deltaY;

      if (accumulator <= -threshold) {
        onZoomIn();
        accumulator = 0;
      } else if (accumulator >= threshold) {
        onZoomOut();
        accumulator = 0;
      }
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [ref, onZoomIn, onZoomOut, enabled, threshold, requireModifierKey]);
}
