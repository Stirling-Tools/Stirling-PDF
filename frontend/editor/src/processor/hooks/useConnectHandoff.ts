import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { withBasePath } from "@app/constants/app";
import { startConnect, startReauth } from "@processor/api/link";

interface ConnectHandoff {
  /** Stays true through a successful hand-off: the page is leaving, so nothing resolves. */
  busy: boolean;
  error: string | null;
  begin: () => void;
}

export function useConnectHandoff(reauth: boolean): ConnectHandoff {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Back from Stirling can restore this page with its heap intact, leaving busy stuck on and the
    // dialog pinned to the ghost step. Being shown at all means we are not mid-navigation.
    const shown = () => setBusy(false);
    window.addEventListener("pageshow", shown);
    return () => window.removeEventListener("pageshow", shown);
  }, []);

  const begin = useCallback(() => {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        // Stated, not inferred: only the frontend knows its own base path.
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
            "processor.accountLink.modal.noAuthorizeUrl",
            "Stirling did not return somewhere to continue. Try again in a moment.",
          ),
        );
        setBusy(false);
      } catch {
        setError(
          t(
            "processor.accountLink.modal.startFailed",
            "Could not reach Stirling to start the connection. Check this server's outbound network access, then try again.",
          ),
        );
        setBusy(false);
      }
    })();
  }, [reauth, t]);

  return { busy, error, begin };
}
