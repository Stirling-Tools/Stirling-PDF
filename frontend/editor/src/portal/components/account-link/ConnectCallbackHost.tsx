import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "@app/ui";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import {
  completeConnect,
  startConnect,
  type ConnectPhase,
} from "@portal/api/link";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";
import { useAccountLinkContext } from "@portal/contexts/AccountLinkContext";
import {
  ConnectCallbackView,
  type ConnectCallbackState,
} from "@portal/components/account-link/ConnectCallbackView";
import "@portal/views/ConnectCallback.css";

/** What the callback route hands over, read from the URL fragment before stripping it. */
export interface AccountLinkReturn {
  type: string | null;
  nonce: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

interface LocationState {
  accountLinkReturn?: AccountLinkReturn;
}

/**
 * Finishes the handshake and reports the outcome, over the portal the admin
 * started from.
 *
 * Mounted alongside the other portal-wide modal rather than being its own route:
 * the result is a step in a task, so the page behind it should still be there.
 */
export function ConnectCallbackHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { refresh } = useAccountLinkContext();
  const handover = (location.state as LocationState | null)?.accountLinkReturn;

  const [state, setState] = useState<ConnectCallbackState | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  const nonceRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  const finish = useCallback(
    async (nonce: string) => {
      setState("working");
      try {
        const outcome = toViewState((await completeConnect(nonce)).phase);
        setState(outcome);
        // The portal read its status on mount, before this existed. Without this
        // the page behind the modal still says unlinked until a reload.
        if (outcome === "linked") await refresh();
      } catch {
        // Could not reach our own backend. The handshake is still open, so this
        // is worth another attempt rather than a restart.
        setState("retry");
      }
    },
    [refresh],
  );

  useEffect(() => {
    if (!handover || startedRef.current) return;
    startedRef.current = true;

    const { type, nonce, accessToken, refreshToken } = handover;
    if (type !== "link" || !nonce) {
      setState("malformed");
      return;
    }
    nonceRef.current = nonce;

    void (async () => {
      if (accessToken && refreshToken) {
        try {
          const supabase = ensureSaasSupabase();
          // Logged, not swallowed: silently this resurfaces later as "session
          // expired" on the usage page, with nothing tying it back here.
          if (!supabase) {
            console.warn(
              "[account-link] no Supabase client: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY are not set for this build",
            );
          } else {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) {
              console.warn("[account-link] setSession failed:", error.message);
            } else {
              setSessionRestored(true);
            }
          }
        } catch (e) {
          console.warn("[account-link] session hand-off threw:", e);
        }
      } else {
        console.warn(
          "[account-link] callback carried no tokens; the approval page had no session to pass",
        );
      }
      await finish(nonce);
    })();
  }, [handover, finish]);

  /**
   * Retry means different things either side of a still-valid handshake: finish the one we have, or open a new one when it is past saving.
   */
  const onRetry = useCallback(() => {
    if (state === "retry" && nonceRef.current) {
      void finish(nonceRef.current);
      return;
    }
    setState("working");
    void startConnect()
      .then((status) => {
        if (status.authorizeUrl) {
          window.location.assign(status.authorizeUrl);
        } else {
          setState("rejected");
        }
      })
      .catch(() => setState("retry"));
  }, [state, finish]);

  // Drops the handover with it, so a back navigation does not reopen the result.
  const done = useCallback(() => {
    setState(null);
    navigate(PORTAL_BASENAME, { replace: true });
  }, [navigate]);

  if (!state) return null;

  return (
    <Modal
      open
      onClose={done}
      width="md"
      title={t(
        "portal.accountLink.connect.callback.modalTitle",
        "Connecting this server",
      )}
    >
      <ConnectCallbackView
        state={state}
        sessionRestored={sessionRestored}
        onRetry={onRetry}
        onDone={done}
      />
    </Modal>
  );
}

/**
 * PENDING and UNAVAILABLE collapse into one "try again" state: both mean the handshake is intact but unfinished, which is the same thing to do about it.
 */
function toViewState(phase: ConnectPhase): ConnectCallbackState {
  switch (phase) {
    case "LINKED":
      return "linked";
    case "EXPIRED":
      return "expired";
    case "PENDING":
    case "UNAVAILABLE":
      return "retry";
    default:
      return "rejected";
  }
}
