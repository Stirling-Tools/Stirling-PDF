import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { completeConnect, type ConnectPhase } from "@portal/api/link";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";
import { useAccountLinkContext } from "@portal/contexts/AccountLinkContext";
import { useUI } from "@portal/contexts/UIContext";
import type { ConnectCallbackState } from "@portal/components/account-link/ConnectCallbackView";

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
 * Finishes the handshake and hands the outcome to the connect dialog as its last step.
 *
 * <p>Renders nothing. The result belongs on step 3 of the dialog the admin left on step 2, so this
 * publishes into {@link useUI} and the single dialog host reopens there. A dialog of its own would
 * arrive with no progress bar and nothing connecting it to the task that sent them away.
 *
 * <p>Mounted app-wide rather than on the callback route, which only reads the fragment and
 * navigates: by the time there is an outcome to show, that route is gone.
 */
export function ConnectCallbackHost() {
  const location = useLocation();
  const { refresh } = useAccountLinkContext();
  const { publishConnectOutcome } = useUI();
  const handover = (location.state as LocationState | null)?.accountLinkReturn;

  const startedRef = useRef(false);

  // Held in refs so the effect runs on the hand-over alone, not on the identity of callbacks that
  // change every render. The effect must not re-run: it consumes a single-use nonce.
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
          // Logged, not swallowed: silently this resurfaces later as "session expired" on the
          // usage page, with nothing tying it back here.
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

    /**
     * Claims the handshake and publishes what came back.
     *
     * <p>Passes itself as {@code reclaim} for the states where the row is still there, so the
     * dialog's Try again re-claims rather than opening a new handshake. Recursive on purpose: a
     * second failure is offered the same choice as the first.
     */
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
        // The portal read its status on mount, before this existed. Without this the page behind
        // the dialog still says unlinked until a reload.
        if (state === "linked") await refreshRef.current();
      } catch {
        // Could not reach our own backend. The handshake is untouched, so this is worth another
        // attempt rather than a restart.
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
