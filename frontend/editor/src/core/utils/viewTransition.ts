import { flushSync } from "react-dom";

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

/**
 * Runs `update` inside a View Transition, or plainly where none is available.
 *
 * The document carries `data-view-transition="running"` for the transition's
 * duration so CSS can drop animations that would otherwise run behind the
 * snapshots (see ToolPanel.css).
 */
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
    const root = document.documentElement;
    root.dataset.viewTransition = "running";
    const transition = doc.startViewTransition(() => flushSync(update));
    const clear = () => {
      delete root.dataset.viewTransition;
    };
    void transition.finished.then(clear, clear);
    return transition.finished;
  }
  update();
  return Promise.resolve();
}
