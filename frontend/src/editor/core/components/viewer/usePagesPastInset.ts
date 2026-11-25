import { useEffect, useState, type RefObject } from "react";

/** Marks the viewport whose right padding grows by the inset while pages run past it. */
export const VIEWER_VIEWPORT_ATTR = "data-viewer-viewport";
/** Set on the pages box while its pages run under the inset, which then floats over them. */
export const PAGES_PAST_INSET_ATTR = "data-pages-past-inset";

/**
 * Whether the pages have been zoomed wider than the room beside a page tool's right
 * inset. While they are, the inset floats over the pages rather than being reserved
 * beside them, so a zoomed page scrolls under it instead of stopping at a blank column.
 *
 * Only growth crosses over: a zoom the pages already had when the inset appeared is
 * left to the viewer's refit, which fits them beside it. Zooming back within the room
 * reserves it again. `area` is the pages box; `reservedRem` the rest of its right
 * margin (the viewer sidebars). Measured from the scroller, which the margin does not
 * resize, so applying the answer cannot flip it.
 */
export function usePagesPastInset(
  area: RefObject<HTMLElement | null>,
  insetRem: number,
  reservedRem: number,
): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const box = area.current;
    if (!box || insetRem <= 0) {
      setPast(false);
      return;
    }
    let raf = 0;
    let scrolled: { scroller: Element; width: number } | null = null;
    const resizes = new ResizeObserver(() => schedule());
    const measure = () => {
      const viewport = box.querySelector<HTMLElement>(
        `[${VIEWER_VIEWPORT_ATTR}]`,
      );
      const scroller = viewport?.firstElementChild;
      if (!viewport || !(scroller instanceof HTMLElement)) return;
      resizes.observe(viewport);
      resizes.observe(scroller);
      const rem = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      // Width plus margin is the pages box's full span, mid-transition included.
      const span =
        box.getBoundingClientRect().width +
        parseFloat(getComputedStyle(box).marginRight);
      const room = span - (reservedRem + insetRem) * rem;
      const gap = parseFloat(getComputedStyle(viewport).paddingLeft);
      const width = scroller.offsetWidth;
      const grew =
        scrolled?.scroller === scroller && width > scrolled.width + 1;
      scrolled = { scroller, width };
      const over = width + gap * 2 > room + 1;
      setPast((was) => over && (was || grew));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    resizes.observe(box);
    // A document swap replaces the viewport, which no observer on the old one sees.
    const mutations = new MutationObserver(schedule);
    mutations.observe(box, { childList: true, subtree: true });
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      resizes.disconnect();
      mutations.disconnect();
    };
  }, [area, insetRem, reservedRem]);

  return past;
}
