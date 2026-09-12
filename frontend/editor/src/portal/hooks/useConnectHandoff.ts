import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { withBasePath } from "@app/constants/app";
import { startConnect, startReauth } from "@portal/api/link";
import { rememberConnect } from "@portal/auth/pendingConnect";
import { useUI } from "@portal/contexts/UIContext";

interface ConnectHandoff {
  /** Stays true through a successful hand-off: the page is leaving, so nothing resolves. */
  busy: boolean;
  error: string | null;
  begin: () => void;
}

export function useConnectHandoff(reauth: boolean): ConnectHandoff {
  const { t } = useTranslation();
  const location = useLocation();
  const { linkReturnSection } = useUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Back from Stirling can restore this page with its heap intact, leaving busy stuck on and the
    // dialog pinned to the ghost step. Being shown at all means we are not mid-navigation.
    const shown = () => {
      inFlight.current = false;
      setBusy(false);
    };
    window.addEventListener("pageshow", shown);
    return () => {
      mounted.current = false;
      window.removeEventListener("pageshow", shown);
    };
  }, []);

  const begin = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const ownerId = localStorage.getItem("stirling.portalSaasOwner");
        if (!ownerId) throw new Error("A local organization owner is required");
        // Stated, not inferred: only the frontend knows its own base path.
        const browserState = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        const callback = new URL(
          withBasePath("/account-link/callback"),
          window.location.origin,
        );
        callback.searchParams.set("state", browserState);
        const callbackUrl = callback.toString();
        const status = reauth
          ? await startReauth(callbackUrl)
          : await startConnect(window.location.hostname, callbackUrl);
        if (!mounted.current) return;
        if (status.phase === "CALLBACK_MISMATCH") {
          setError(
            t(
              "portal.accountLink.modal.callbackMismatch",
              "This server's configured frontend address does not match the address you opened. Open the server at its configured address, or update Frontend URL in General settings, then try again.",
            ),
          );
          setBusy(false);
          inFlight.current = false;
          return;
        }
        if (status.authorizeUrl) {
          rememberConnect({
            ownerId,
            mode: reauth ? "reauth" : "link",
            returnTo: `${location.pathname}${location.search}`,
            settingsSection: linkReturnSection,
            browserState,
          });
          window.location.assign(status.authorizeUrl);
          return;
        }
        // Already linked, or a handshake we cannot act on. Nothing to navigate to.
        setError(
          t(
            "portal.accountLink.modal.noAuthorizeUrl",
            "Stirling did not return somewhere to continue. Try again in a moment.",
          ),
        );
        setBusy(false);
        inFlight.current = false;
      } catch {
        if (!mounted.current) return;
        setError(
          t(
            "portal.accountLink.modal.startFailed",
            "Could not reach Stirling to start the connection. Check this server's outbound network access, then try again.",
          ),
        );
        setBusy(false);
        inFlight.current = false;
      }
    })();
  }, [reauth, t, location.pathname, location.search, linkReturnSection]);

  return { busy, error, begin };
}
