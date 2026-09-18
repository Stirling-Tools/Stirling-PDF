/** True when focus is in a typing surface (contenteditable, input, etc). */
export function isFocusInContentEditable(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

// True when focus is in a FORM field (Find/Replace/password inputs) as opposed
// to a run's contenteditable.
export function isFocusInFormField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

// Find the page index whose midpoint is closest to the viewport's vertical
// centre.
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

// The TRUE page index of the page nearest the viewport centre - unlike {@link
// findVisiblePageIndex}, which returns a DOM-array position.
export function visiblePageNumber(): number {
  const pages = pageElements();
  if (pages.length === 0) return 0;
  const midY = window.innerHeight / 2;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const el of pages) {
    const n = Number((el.dataset.testid ?? "").replace("pdf-editor-page-", ""));
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
    document.querySelectorAll<HTMLElement>('[data-testid^="pdf-editor-page-"]'),
  ).filter((el) => /^pdf-editor-page-\d+$/.test(el.dataset.testid ?? ""));
}

// Yield so React can commit the state updates queued before the await (load
// progress, and the empty page list between two documents).
//
// Deliberately NOT scheduler.yield(): its continuation task outranks React's
// normal-priority work, so several loader steps can run before React commits
// anything and the empty-pages commit is coalesced away entirely.
// https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
export function yieldToBrowser(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof MessageChannel !== "undefined") {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(0);
      return;
    }
    setTimeout(resolve, 0);
  });
}
