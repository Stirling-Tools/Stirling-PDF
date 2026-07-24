/** True when focus is in a typing surface (contenteditable, input, etc). */
export function isFocusInContentEditable(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * True when focus is in a FORM field (Find/Replace/password inputs) as
 * opposed to a run's contenteditable. Form fields keep their native
 * editing shortcuts (Ctrl+Z etc); contenteditables route to the editor.
 */
export function isFocusInFormField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
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

/**
 * The TRUE page index (parsed from `data-testid="v2-page-N"`) of the page
 * nearest the viewport centre - unlike {@link findVisiblePageIndex}, which
 * returns a DOM-array position. Use this when you need the model page index
 * (e.g. choosing where to insert), not a scroll target. Returns 0 when no
 * page surfaces are mounted.
 */
export function visiblePageNumber(): number {
  const pages = pageElements();
  if (pages.length === 0) return 0;
  const midY = window.innerHeight / 2;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const el of pages) {
    const n = Number((el.dataset.testid ?? "").replace("v2-page-", ""));
    if (!Number.isFinite(n)) continue;
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - midY);
    if (dist < bestDist) {
      bestDist = dist;
      best = n;
    }
  }
  return best;
}

/** All real page surfaces in DOM order, skipping placeholders/error tiles. */
export function pageElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid^="v2-page-"]'),
  ).filter((el) => /^v2-page-\d+$/.test(el.dataset.testid ?? ""));
}
