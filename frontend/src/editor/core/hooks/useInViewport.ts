import { useEffect, useState, type RefObject } from "react";

const DEFAULT_ROOT_MARGIN = "400px";

// A row scrolled out of the sidebar list is clipped by that list before it ever
// reaches the viewport, so `root: null` sees it as non-intersecting no matter
// what rootMargin says (MDN, "Clipping and the intersection rectangle") and the
// warm-up never happens. The closest scroll container is the root MDN
// recommends for exactly this case.
function nearestScrollableAncestor(element: Element): Element | null {
  let parent = element.parentElement;
  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * True once the referenced element has come within `rootMargin` of its scroll
 * container (or the viewport when nothing scrolls), and stays true after. The
 * margin warms rows just before they scroll into view.
 *
 * Fails open where IntersectionObserver is unavailable, so callers never stall.
 */
export function useInViewport(
  ref: RefObject<Element | null>,
  rootMargin: string = DEFAULT_ROOT_MARGIN,
): boolean {
  const [inViewport, setInViewport] = useState(false);

  useEffect(() => {
    if (inViewport) return;
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setInViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInViewport(true);
          observer.disconnect();
        }
      },
      { root: nearestScrollableAncestor(element), rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, inViewport]);

  return inViewport;
}
