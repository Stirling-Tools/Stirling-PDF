import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";

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

export function isModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

// The page index of the page nearest the viewport centre.
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
function pageElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid^="pdf-editor-page-"]'),
  ).filter((el) => /^pdf-editor-page-\d+$/.test(el.dataset.testid ?? ""));
}

/**
 * Scrolls `el` into view, or, when its page is not mounted, asks the host to
 * bring that page on screen.
 */
export function revealOnPage(el: Element | null, pageIndex: number): void {
  if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  else currentEditorSession()?.revealPage(pageIndex);
}
