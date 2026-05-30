/** True when the active element is a contenteditable surface. */
export function isFocusInContentEditable(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return el?.getAttribute?.("contenteditable") === "true";
}

/**
 * Find the page index whose midpoint is closest to the viewport's vertical
 * centre. Returns 0 when no `[data-testid="v2-page-N"]` elements are
 * mounted. Used by zoom-target picking, page rotation, and page nav.
 */
export function findVisiblePageIndex(): number {
  const pages = pageElements();
  if (pages.length === 0) return 0;
  const midY = window.innerHeight / 2;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  pages.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - midY);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

/** All real page surfaces in DOM order, skipping placeholders/error tiles. */
export function pageElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid^="v2-page-"]'),
  ).filter((el) => /^v2-page-\d+$/.test(el.dataset.testid ?? ""));
}
