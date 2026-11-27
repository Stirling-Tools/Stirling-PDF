import { flushSync } from "react-dom";

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

// A collapsed-rail tool click starts two transitions in one gesture; the marker
// must outlive the first one that settles, or the width transition re-enables
// behind the snapshot the second one is still animating.
let runningTransitions = 0;

function markTransitionRunning(): () => void {
  runningTransitions++;
  document.documentElement.dataset.viewTransition = "running";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    runningTransitions = Math.max(0, runningTransitions - 1);
    if (runningTransitions === 0) {
      delete document.documentElement.dataset.viewTransition;
    }
  };
}

/**
 * Runs `update` inside a View Transition, or plainly where none is available.
 *
 * The document carries `data-view-transition="running"` while any transition is
 * live so CSS can drop animations that would otherwise run behind the snapshots
 * (see ToolPanel.css).
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
    const release = markTransitionRunning();
    let transition: { finished: Promise<void> };
    try {
      transition = doc.startViewTransition(() => flushSync(update));
    } catch (error) {
      release();
      throw error;
    }
    void transition.finished.then(release, release);
    return transition.finished;
  }
  update();
  return Promise.resolve();
}
