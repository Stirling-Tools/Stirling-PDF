import { withViewTransition as withCoreViewTransition } from "@core/utils/viewTransition";

// On Linux the desktop webview is WebKitGTK, whose UI process segfaults re-entering
// accelerated compositing after a View Transition, so apply updates plainly there.
function isWebKitGtk(): boolean {
  return typeof navigator !== "undefined" && /Linux/.test(navigator.userAgent);
}

/** Desktop override: the core helper, minus the View Transition on WebKitGTK. */
export function withViewTransition(update: () => void): Promise<void> {
  if (isWebKitGtk()) {
    update();
    return Promise.resolve();
  }
  return withCoreViewTransition(update);
}
