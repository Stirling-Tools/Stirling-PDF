import { supabase } from "@app/auth/supabase";

/**
 * Completes the self-hosted account-link handshake when this SaaS login was
 * opened as a popup (`/login?link=1&origin=<portalOrigin>`): posts the signed-in
 * session back to the opener (the Portal) and closes. Returns true when it
 * handled the popup, so callers skip their normal post-login redirect.
 *
 * Interim trust model: posts the user's own session to the origin that opened
 * the popup. Before production this needs an origin allowlist (folds into the
 * shared-auth work); fine for manual testing.
 */
export async function tryCompleteAccountLinkPopup(): Promise<boolean> {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("link") !== "1") return false;
    const targetOrigin = url.searchParams.get("origin");
    if (!targetOrigin || !window.opener || window.opener === window)
      return false;

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return false;

    window.opener.postMessage(
      { type: "stirling-account-link", session: { access_token: accessToken } },
      targetOrigin,
    );
    window.close();
    return true;
  } catch {
    return false;
  }
}
