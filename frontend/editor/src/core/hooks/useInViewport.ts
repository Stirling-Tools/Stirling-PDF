import { useEffect, useState, type RefObject } from "react";

const DEFAULT_ROOT_MARGIN = "400px";

/**
 * True once the referenced element has come within `rootMargin` of the
 * viewport, and stays true after. The margin warms rows just before they
 * scroll into view, so content is usually ready by the time it is seen.
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
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, inViewport]);

  return inViewport;
}
