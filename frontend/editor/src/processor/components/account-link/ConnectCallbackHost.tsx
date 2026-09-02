import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { completeConnect, type ConnectPhase } from "@processor/api/link";
import { ensureSaasSupabase } from "@processor/auth/saasSupabase";
import { useAccountLinkContext } from "@processor/contexts/AccountLinkContext";
import { useUI } from "@processor/contexts/UIContext";
import type { ConnectCallbackState } from "@processor/components/account-link/ConnectCallbackView";

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
 * Renders nothing: the result belongs on step 3 of the dialog the admin left, so this publishes the
 * outcome and the single dialog host reopens there. Mounted app-wide because the callback route
 * only reads the fragment and navigates, so it is gone by the time there is an outcome.
 */
export function ConnectCallbackHost() {
  const location = useLocation();
  const { refresh } = useAccountLinkContext();
  const { publishConnectOutcome } = useUI();
  const handover = (location.state as LocationState | null)?.accountLinkReturn;

  const startedRef = useRef(false);

  // Refs so the effect runs on the hand-over alone: it consumes a single-use nonce.
  const publishRef = useRef(publishConnectOutcome);
  publishRef.current = publishConnectOutcome;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!handover || startedRef.current) return;
    startedRef.current = true;

    const { type, nonce, accessToken, refreshToken } = handover;
    if (type !== "link" || !nonce) {
      publishRef.current({ state: "malformed", sessionRestored: false });
      return;
    }

    void (async () => {
      let sessionRestored = false;
      if (accessToken && refreshToken) {
        try {
          const supabase = ensureSaasSupabase();
          // Logged, not swallowed: this resurfaces later as "session expired" otherwise.
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
              sessionRestored = true;
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

      await claim(nonce, sessionRestored);
    })();

    /** Passes itself as {@code reclaim} so Try again re-claims rather than opening a handshake. */
    async function claim(nonce: string, sessionRestored: boolean) {
      publishRef.current({ state: "working", sessionRestored });
      const again = () => void claim(nonce, sessionRestored);
      try {
        const state = toViewState((await completeConnect(nonce)).phase);
        publishRef.current({
          state,
          sessionRestored,
          reclaim: state === "retry" ? again : undefined,
        });
        // Without this the page behind the dialog says unlinked until a reload.
        if (state === "linked") await refreshRef.current();
      } catch {
        // Our own backend is unreachable; the handshake is untouched, so retrying beats restarting.
        publishRef.current({ state: "retry", sessionRestored, reclaim: again });
      }
    }
  }, [handover]);

  return null;
}

/**
 * PENDING and UNAVAILABLE collapse into one "try again" state: both mean the handshake is intact but
 * unfinished, which is the same thing to do about it.
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
