import { useEffect, useState, type RefObject } from "react";

// The element's own width, tracked as it resizes. A container query can hide a
// control but cannot move it into a menu, so that decision has to measure.
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
