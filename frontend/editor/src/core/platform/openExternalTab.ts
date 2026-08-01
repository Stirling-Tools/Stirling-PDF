/**
 * core/web implementation of the @app/platform/openExternalTab seam.
 *
 * Distinct from @app/platform/openExternal: that seam is for "leave and return"
 * redirects (Stripe checkout), so its saas impl navigates the CURRENT tab. A PDF
 * link must never do that — it would tear the user out of their document — so
 * this seam always opens alongside the app. Desktop shadows it to escape the
 * Tauri webview; saas/proprietary fall through to this window.open.
 */
export type OpenExternalTab = (url: string) => Promise<void>;

export const openExternalTab: OpenExternalTab = async (
  url: string,
): Promise<void> => {
  window.open(url, "_blank", "noopener,noreferrer");
};
