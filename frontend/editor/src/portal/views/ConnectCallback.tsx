import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { ThemeProvider, useTheme } from "@portal/contexts/ThemeContext";
import { SuiProvider } from "@portal/theme/SuiProvider";
import "@portal/theme/base.css";
import {
  completeConnect,
  startConnect,
  type ConnectPhase,
} from "@portal/api/link";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";
import {
  ConnectCallbackView,
  type ConnectCallbackState,
} from "@portal/components/account-link/ConnectCallbackView";
import "@portal/views/ConnectCallback.css";

/**
 * Where the SaaS approval page sends the admin back to.
 *
 * <p>Two independent things arrive in the fragment, and they are handled
 * separately on purpose:
 *
 * <ul>
 *   <li>The admin's SaaS session, which is deposited into the shared Supabase
 *       client so every attended portal read (usage, billing, documents) starts
 *       working. This is the half that the device-credential-only design could
 *       never provide, because a device credential identifies the server, not a
 *       person.
 *   <li>The nonce, which the local backend needs in order to collect its device
 *       credential. That collection is a server-to-server call authenticated by
 *       a secret this page never sees.
 * </ul>
 *
 * <p>The fragment is stripped before anything awaits, so a live token does not
 * linger in the address bar or the history entry.
 */
function ConnectCallbackContent() {
  const navigate = useNavigate();
  const [state, setState] = useState<ConnectCallbackState>("working");
  const [sessionRestored, setSessionRestored] = useState(false);
  const nonceRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  const finish = useCallback(async (nonce: string) => {
    setState("working");
    try {
      setState(toViewState((await completeConnect(nonce)).phase));
    } catch {
      // Could not reach our own backend. The handshake is still open, so this
      // is worth another attempt rather than a restart.
      setState("retry");
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    // Before any await: the fragment carries a live session token.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );

    const nonce = params.get("nonce");
    if (params.get("type") !== "link" || !nonce) {
      setState("malformed");
      return;
    }
    nonceRef.current = nonce;

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    void (async () => {
      // Deposited first and independently of the link. It is the admin's own
      // token in their own browser, and it is useful even if the link needs
      // another attempt.
      if (accessToken && refreshToken) {
        try {
          const supabase = ensureSaasSupabase();
          if (supabase) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (!error) setSessionRestored(true);
          }
        } catch {
          // A failed session hand-off must not stop the link from completing.
        }
      }
      await finish(nonce);
    })();
  }, [finish]);

  /**
   * Retry means different things either side of a still-valid handshake: finish
   * the one we have, or open a new one when it is past saving.
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

  return (
    <ConnectCallbackView
      state={state}
      sessionRestored={sessionRestored}
      onRetry={onRetry}
      onDone={() => navigate("/", { replace: true })}
    />
  );
}

/** Binds Mantine to the portal's theme, as {@link PortalApp} does for the portal proper. */
function ThemedSui({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <SuiProvider colorScheme={theme}>{children}</SuiProvider>;
}

/**
 * The callback with its own minimal provider shell.
 *
 * <p>This route is a sibling of the portal's, not a page inside it, so it inherits
 * none of {@link PortalApp}'s providers. It needs the theme and Mantine, because the
 * shared Button is a Mantine button underneath, and base.css for the tokens the
 * stylesheet references.
 *
 * <p>Deliberately no PortalAuthBoundary. This is a redirect target carrying a
 * one-time nonce in the fragment, and a client-side auth gate could navigate away
 * to a login screen and take the fragment with it. The endpoints it calls are
 * admin-gated server side, so nothing is lost by not gating here, and a failed call
 * shows the retry state instead of silently discarding the handshake.
 */
export default function ConnectCallback() {
  return (
    <ThemeProvider>
      <ThemedSui>
        {/* Scopes base.css the same way the portal does, so it cannot restyle the host editor. */}
        <div className="portal-scope">
          <ConnectCallbackContent />
        </div>
      </ThemedSui>
    </ThemeProvider>
  );
}

/**
 * PENDING and UNAVAILABLE collapse into one "try again" state: both mean the
 * handshake is intact but unfinished, which is the same thing to do about it.
 * NONE after a callback means there was nothing left to finish.
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
