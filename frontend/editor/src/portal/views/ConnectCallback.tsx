import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import type { AccountLinkReturn } from "@portal/components/account-link/ConnectCallbackHost";
import {
  readPendingConnect,
  clearPendingConnect,
} from "@portal/auth/pendingConnect";

/**
 * Return leg of the account-link handshake. Stirling redirects here with the
 * admin's session in the URL fragment.
 *
 * This route only reads the fragment and hands it to the portal, which owns the
 * rest. Rendering the outcome here would put it on an empty page; the portal is
 * where the admin started, so that is where the result belongs.
 */
export default function ConnectCallback() {
  const navigate = useNavigate();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const pending = readPendingConnect();
    const browserState = new URLSearchParams(window.location.search).get(
      "state",
    );
    const matched = pending?.browserState === browserState ? pending : null;
    clearPendingConnect();
    // Before anything else: the fragment carries a live session token.
    window.history.replaceState(null, "", window.location.pathname);

    const accountLinkReturn: AccountLinkReturn = {
      type: params.get("type"),
      nonce: params.get("nonce"),
      accessToken: params.get("access_token"),
      refreshToken: params.get("refresh_token"),
      pending: matched,
    };
    // Router state, not the URL: the tokens are live and must not be re-shareable.
    navigate(matched?.returnTo ?? PORTAL_BASENAME, {
      replace: true,
      state: { accountLinkReturn },
    });
  }, [navigate]);

  return null;
}
