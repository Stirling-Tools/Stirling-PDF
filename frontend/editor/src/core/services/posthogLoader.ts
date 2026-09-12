import type posthog from "posthog-js";

export type PosthogClient = typeof posthog;

let loadPromise: Promise<PosthogClient | null> | null = null;

/**
 * Load posthog-js (~200 KB) on first use instead of pulling it into the
 * startup bundle graph. Resolves null when the module cannot load; callers
 * already gate every capture on `__loaded`, so a failed load just disables
 * analytics.
 */
export function loadPosthog(): Promise<PosthogClient | null> {
  loadPromise ??= import("posthog-js")
    .then((m) => m.default as PosthogClient)
    .catch((err) => {
      console.warn("[posthog] lazy load failed:", err);
      return null;
    });
  return loadPromise;
}
