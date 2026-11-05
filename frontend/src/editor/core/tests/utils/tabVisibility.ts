/**
 * Drives the tab-visibility signal TanStack Query's focusManager listens to.
 *
 * The event must bubble: query-core subscribes on `window`, while the real
 * `visibilitychange` is dispatched at `document` and reaches window by bubbling.
 * A non-bubbling event on document leaves the manager focused, and a poll test
 * written that way passes against an implementation that never pauses.
 */
export function setTabHidden(hidden: boolean): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}

/** Restores the jsdom default, for a suite that hid the tab. */
export function resetTabVisibility(): void {
  setTabHidden(false);
}
