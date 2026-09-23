/**
 * saas (web) implementation of the @app/platform/openExternal seam.
 *
 * The seam's consumers are cloud-layer "leave-and-return" redirects — Stripe
 * Checkout / customer portal — which mint a session with a return_url and expect
 * the user to come back to the app afterwards. On the web that means a SAME-TAB
 * full-page navigation (window.location.assign): the return_url then lands the
 * user back in the originating tab. (A post-await window.open would also be
 * popup-blocked as a non-user-gesture.) The desktop impl instead hands the URL
 * to the system browser and the app is re-entered via its deep-link return.
 */
import type { OpenExternal } from "@cloud/platform/openExternal";

export const openExternal: OpenExternal = async (
  url: string,
): Promise<void> => {
  window.location.assign(url);
};
