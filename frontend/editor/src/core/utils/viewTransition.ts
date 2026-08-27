import { flushSync } from "react-dom";

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

/** Runs a state update in a View Transition, plainly where that is unavailable. */
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
  if (doc.startViewTransition && !reduced) {
    return doc.startViewTransition(() => flushSync(update)).finished;
  }
  update();
  return Promise.resolve();
}
