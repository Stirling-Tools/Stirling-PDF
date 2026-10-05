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
 * Scrolls the tool picker until a target tool button appears and is highlighted.
 * Because tool picker sections are lazily mounted when scrolled near the viewport,
 * offscreen tools like Crop do not exist in the DOM until scrolled towards.
 */
export async function revealPickerTool(
  selector: string,
  timeoutMs = 7000,
): Promise<void> {
  if (typeof document === "undefined") {
    return;
  }

  const existing = document.querySelector<HTMLElement>(selector);
  if (existing && existing.getClientRects().length > 0) {
    existing.scrollIntoView({ block: "center", behavior: "smooth" });
    await waitForHighlightable(selector, timeoutMs);
    return;
  }

  const scroller = document.querySelector<HTMLElement>(
    ".tool-picker-scrollable",
  );
  if (scroller) {
    const stepDelta = Math.max(scroller.clientHeight * 0.8, 300);
    const maxSteps = 20;

    for (let step = 0; step < maxSteps; step += 1) {
      const found = document.querySelector<HTMLElement>(selector);
      if (found) {
        found.scrollIntoView({ block: "center", behavior: "smooth" });
        await waitForHighlightable(selector, timeoutMs);
        return;
      }

      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight) {
        break;
      }

      scroller.scrollTop = Math.min(
        scroller.scrollTop + stepDelta,
        scroller.scrollHeight,
      );
      scroller.dispatchEvent(new Event("scroll"));

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  const finalFound = document.querySelector<HTMLElement>(selector);
  if (finalFound) {
    finalFound.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  await waitForHighlightable(selector, timeoutMs);
}

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
