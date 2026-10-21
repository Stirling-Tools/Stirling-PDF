const PDF_FOCUS_SELECTOR = "[data-pdf-focus-target]";
// The viewer replaces the conversion panel in the same commit, but if its mount
// fails there is no point holding an observer for the rest of the session.
const FOCUS_GUARD_MS = 5000;

/**
 * Moves keyboard focus onto the PDF viewer once it exists. The conversion panel
 * unmounts before the viewer mounts, so callers cannot focus it synchronously.
 */
export function focusPdfViewerWhenReady(): void {
  if (typeof document === "undefined" || !document.body) return;

  const tryFocus = (): boolean => {
    const target = document.querySelector<HTMLElement>(PDF_FOCUS_SELECTOR);
    if (!target) return false;
    target.focus({ preventScroll: true });
    return document.activeElement === target;
  };

  if (tryFocus()) return;
  if (typeof MutationObserver === "undefined") return;

  const observer = new MutationObserver(() => {
    if (tryFocus()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), FOCUS_GUARD_MS);
}
