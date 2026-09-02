import { useEffect, useState, type RefObject } from "react";

/**
 * The element's own width in pixels, tracked as it resizes.
 *
 * A CSS container query can hide a control that does not fit, but it cannot
 * move one into a menu - that is a change of markup, not of style. So the one
 * place the toolbar needs to make a structural decision has to measure.
 *
 * Returns null until the first observation, so a caller can render its roomy
 * layout rather than flashing the compact one on mount.
 */
export function useElementWidth(
  ref: RefObject<HTMLElement | null>,
): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      // No observer (jsdom, very old engines): measure once and stay there.
      setWidth(el.getBoundingClientRect().width);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
