import { flushSync } from "react-dom";

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

// With its DMA-BUF renderer off (WEBKIT_DISABLE_DMABUF_RENDERER, which the Linux
// desktop app sets, or the Debian/Ubuntu NVIDIA patch), WebKitGTK dereferences a
// null backing store when a view transition forces accelerated compositing, and
// the whole app segfaults (WebKit bug 324730). Blink UAs also claim AppleWebKit.
function isWebKitGtk(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /\bLinux\b/.test(ua) &&
    /AppleWebKit\//.test(ua) &&
    !/Chrome\/|Chromium\/|Android/.test(ua)
  );
}

/** Runs a state update in a View Transition, plainly where that is unavailable or unsafe. */
export function withViewTransition(update: () => void): Promise<void> {
  if (typeof document === "undefined") {
    update();
    return Promise.resolve();
  }
  // Callers don't each check: reduced motion still gets the state change.
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const doc = document as ViewTransitionDoc;
  if (doc.startViewTransition && !reduced && !isWebKitGtk()) {
    return doc.startViewTransition(() => flushSync(update)).finished;
  }
  update();
  return Promise.resolve();
}
