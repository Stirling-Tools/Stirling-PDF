/**
 * saas (web) implementation of the @app/platform/openExternal seam.
 *
 * On the web there is no embedded webview to escape: handing the URL to the
 * browser is enough. We open in a new tab with noopener/noreferrer (the same
 * pattern saas already uses for the desktop-download link in
 * useSaasOnboardingState) so the opened page cannot reach back into our window.
 * Same-tab Stripe redirects that need location.assign keep doing that at their
 * own call sites — this seam is the generic "send the user to an external URL".
 */
import type { OpenExternal } from "@cloud/platform/openExternal";

export const openExternal: OpenExternal = async (url: string): Promise<void> => {
  window.open(url, "_blank", "noopener,noreferrer");
};
