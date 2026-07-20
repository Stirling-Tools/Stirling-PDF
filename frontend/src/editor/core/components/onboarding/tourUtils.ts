/**
 * Waits for a CSS selector to appear in the DOM using MutationObserver.
 * Resolves immediately if already present; resolves after timeoutMs if it
 * never appears (no throw — tour steps are best-effort).
 */
export function waitForElement(
  selector: string,
  timeoutMs = 7000,
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }

    if (document.querySelector(selector)) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        clearTimeout(timer);
        observer.disconnect();
        resolve();
      }
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeoutMs);

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

const nudgeReactour = () => {
  window.dispatchEvent(new Event("resize"));
  requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
};

/**
 * Waits for a CSS selector to be present AND have a non-zero bounding box,
 * then nudges Reactour to recalculate its spotlight position.
 *
 * Uses MutationObserver to detect element insertion, then ResizeObserver to
 * detect when the element receives layout dimensions.
 */
export function waitForHighlightable(
  selector: string,
  timeoutMs = 7000,
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }

    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const cleanup = () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };

    const done = () => {
      clearTimeout(timer);
      cleanup();
      nudgeReactour();
      resolve();
    };

    const timer = setTimeout(done, timeoutMs);

    const watchLayout = (el: HTMLElement) => {
      if (el.getClientRects().length > 0) {
        done();
        return;
      }
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 || entry.contentRect.height > 0) {
            done();
            return;
          }
        }
      });
      resizeObserver.observe(el);
    };

    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      watchLayout(el);
      return;
    }

    mutationObserver = new MutationObserver(() => {
      const found = document.querySelector<HTMLElement>(selector);
      if (found) {
        mutationObserver!.disconnect();
        mutationObserver = null;
        watchLayout(found);
      }
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
  });
}
