import { useCallback, useState } from "react";

/**
 * Whether a scroller has moved off its top, for a header pinned above it to
 * show a divider. Attach `scrollRef` to the scroller. Detaching it resets to
 * false, so a list that unmounts and comes back at the top does not inherit a
 * stale divider from its last visit.
 */
export function useIsScrolled() {
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const update = () => setScrolled(el.scrollTop > 0);
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      el.removeEventListener("scroll", update);
      setScrolled(false);
    };
  }, []);
  return { scrolled, scrollRef };
}
