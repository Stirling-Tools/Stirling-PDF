import { flushSync } from "react-dom";

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

/**
 * Run a state update inside a View Transition so the browser cross-fades
 * (and morphs any elements sharing a {@code view-transition-name}) between
 * the before/after DOMs.
 *
 * Falls back to a plain synchronous update when the API is unavailable
 * (Firefox <130, JSDOM, motion-reduced preference).
 */
export function withViewTransition(update: () => void): Promise<void> {
  if (typeof document === "undefined") {
    update();
    return Promise.resolve();
  }
  const doc = document as ViewTransitionDoc;
  if (doc.startViewTransition) {
    return doc.startViewTransition(() => flushSync(update)).finished;
  }
  update();
  return Promise.resolve();
}
