import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "@app/ui";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
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

/** Where the SaaS approval page sends the admin back to. */
function ConnectCallbackContent() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
  }, [finish]);

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

  // Back to the portal, where the admin started, rather than the editor root.
  const done = () => navigate(PORTAL_BASENAME, { replace: true });

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

/** Binds Mantine to the portal's theme, as {@link PortalApp} does for the portal proper. */
function ThemedSui({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <SuiProvider colorScheme={theme}>{children}</SuiProvider>;
}

/** The callback with its own minimal provider shell. */
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
