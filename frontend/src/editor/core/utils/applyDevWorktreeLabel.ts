/**
 * Prefixes the browser tab title with the current worktree name during local
 * development so multiple concurrently-running worktrees (e.g. wt1, wt2, spdf1)
 * are distinguishable at a glance instead of all showing "Stirling PDF".
 *
 * The label is injected as a build-time constant by vite.config, sourced from
 * the top-level dev tasks. It is an empty string in production builds, so this
 * whole feature compiles away to a no-op outside `vite` dev-serve.
 */

const LABEL =
  typeof __DEV_WORKTREE_LABEL__ === "string" ? __DEV_WORKTREE_LABEL__ : "";

export function applyDevWorktreeLabel(): void {
  if (!LABEL || typeof document === "undefined") {
    return;
  }

  const prefix = `[${LABEL}] `;

  const ensurePrefixed = () => {
    if (!document.title.startsWith(prefix)) {
      // The app rewrites document.title on route/tool changes; re-apply the
      // prefix on top of whatever the app just set.
      document.title = prefix + document.title;
    }
  };

  ensurePrefixed();

  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(ensurePrefixed).observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}
