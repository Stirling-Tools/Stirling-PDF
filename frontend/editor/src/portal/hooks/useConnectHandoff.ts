import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { withBasePath } from "@app/constants/app";
import { startConnect, startReauth } from "@portal/api/link";

export interface ConnectHandoff {
  /** A handshake is being opened, or the browser is on its way to Stirling. */
  busy: boolean;
  error: string | null;
  begin: () => void;
}

/**
 * Opens a handshake and hands the browser to Stirling.
 *
 * <p>Separated from the dialog so that stays a step machine: this is the only step whose action
 * leaves the page, and it is the step most likely to grow (a pairing code would slot in here
 * without the flow around it knowing).
 *
 * <p>Nothing resolves on success. The browser navigates away and the flow resumes on the callback
 * route, so {@link ConnectHandoff.busy} stays true until the page is gone.
 *
 * <p>Except when the page comes back. Pressing Back on the approval page can restore this one from
 * the browser's cache with its heap intact, so the hand-off is still flagged in flight and the
 * dialog sits on the ghost step for the life of the page. `pageshow` is the signal for exactly
 * that: this page is on screen, so it is not mid-navigation, whatever it thought when it left.
 */
export function useConnectHandoff(reauth: boolean): ConnectHandoff {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fires on a normal load too, where busy is already false and this is a no-op. Not filtered on
    // event.persisted: "the page is being shown" is the fact that matters, not how it got here.
    const shown = () => setBusy(false);
    window.addEventListener("pageshow", shown);
    return () => window.removeEventListener("pageshow", shown);
  }, []);

  const begin = useCallback(() => {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        // The frontend is the only party that knows its own base path, so it states the
        // callback rather than letting the backend infer one.
        const callbackUrl = new URL(
          withBasePath("/account-link/callback"),
          window.location.origin,
        ).toString();
        const status = reauth
          ? await startReauth(callbackUrl)
          : await startConnect(window.location.hostname, callbackUrl);
        if (status.authorizeUrl) {
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
      } catch {
        setError(
          t(
            "portal.accountLink.modal.startFailed",
            "Could not reach Stirling to start the connection. Check this server's outbound network access, then try again.",
          ),
        );
        setBusy(false);
      }
    })();
  }, [reauth, t]);

  return { busy, error, begin };
}
