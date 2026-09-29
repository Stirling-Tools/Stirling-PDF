/**
 * core/web implementation of the @app/platform/openExternalTab seam.
 *
 * Distinct from @app/platform/openExternal: that seam is for "leave and return"
 * redirects (Stripe checkout), so its saas impl navigates the CURRENT tab. A PDF
 * link must never do that — it would tear the user out of their document — so
 * this seam always opens alongside the app. Desktop shadows it to escape the
 * Tauri webview; saas/proprietary fall through to this window.open.
 *
 * Callers are expected to sanitise, but this is the sink that actually hands the
 * URL to the browser, so it re-checks rather than trusting them: window.open on
 * a `javascript:` URL executes it in our own origin.
 */
import { getExternalHref } from "@app/utils/externalUrl";

export type OpenExternalTab = (url: string) => Promise<void>;

export const openExternalTab: OpenExternalTab = async (
  url: string,
): Promise<void> => {
  const safeHref = getExternalHref(url);
  if (!safeHref) {
    console.warn("[openExternalTab] Refused to open unsafe URL:", url);
    return;
  }
  window.open(safeHref, "_blank", "noopener,noreferrer");
};
