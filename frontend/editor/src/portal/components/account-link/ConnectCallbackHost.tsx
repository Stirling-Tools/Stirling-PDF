import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { completeConnect, type ConnectPhase } from "@portal/api/link";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";
import { getSupabaseClient } from "@app/auth/supabase/supabaseClient";
import { clearAccountLinkSession } from "@portal/auth/accountLinkSession";
import { portalSaasSessionRestored } from "@portal/auth/portalSaasSession";
import type { PendingConnect } from "@portal/auth/pendingConnect";
import { useAccountLinkContext } from "@portal/contexts/AccountLinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { getPortalQueryClient } from "@portal/queryClient";
import type { ConnectCallbackState } from "@portal/components/account-link/ConnectCallbackView";

/** Tokens are consumed once and removed from router history before any network request. */
export interface AccountLinkReturn {
  type: string | null;
  nonce: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  pending: PendingConnect | null;
}

interface LocationState {
  accountLinkReturn?: AccountLinkReturn;
}

/** Owns the validated callback and publishes its outcome to the existing modal. */
export function ConnectCallbackHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAccountLinkContext();
  const { publishConnectOutcome } = useUI();
  const handover = (location.state as LocationState | null)?.accountLinkReturn;
  const startedRef = useRef<AccountLinkReturn | null>(null);
  const publishRef = useRef(publishConnectOutcome);
  publishRef.current = publishConnectOutcome;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!handover || startedRef.current === handover) return;
    startedRef.current = handover;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });

    const callback = handover;
    const { type, nonce, pending } = callback;
    const metadata = {
      mode: pending?.mode ?? ("link" as const),
      settingsSection: pending?.settingsSection,
    };
    if (
      (type !== "link" && type !== "reauth") ||
      !nonce ||
      !pending ||
      pending.ownerId !== localStorage.getItem("stirling.portalSaasOwner")
    ) {
      handover.accessToken = null;
      handover.refreshToken = null;
      publishRef.current({
        ...metadata,
        state: "malformed",
        sessionRestored: false,
      });
      return;
    }

    let accepted = false;
    let busy = false;
    let cancelled = false;
    const supabase = ensureSaasSupabase();
    const current = () =>
      !cancelled &&
      mounted.current &&
      supabase === getSupabaseClient() &&
      pending.ownerId === localStorage.getItem("stirling.portalSaasOwner");
    const discardTokens = () => {
      callback.accessToken = null;
      callback.refreshToken = null;
    };
    const cancel = () => {
      cancelled = true;
      discardTokens();
      if (supabase === getSupabaseClient()) clearAccountLinkSession();
    };
    void claim();

    async function claim() {
      if (busy || !current()) return;
      busy = true;
      publishRef.current({
        ...metadata,
        state: "working",
        sessionRestored: false,
        cancel,
      });
      try {
        if (!accepted) {
          const state = toViewState((await completeConnect(nonce!)).phase);
          if (!current()) return;
          if (state !== "linked") {
            if (state !== "retry") {
              discardTokens();
            }
            publishRef.current({
              ...metadata,
              state,
              sessionRestored: false,
              reclaim: state === "retry" ? claim : undefined,
              cancel,
            });
            return;
          }
          accepted = true;
          await refreshRef.current();
          if (!current()) return;
        }

        let sessionRestored = false;
        if (callback.accessToken && callback.refreshToken) {
          if (!supabase)
            throw new Error("SaaS authentication is not configured");
          const { error } = await supabase.auth.setSession({
            access_token: callback.accessToken,
            refresh_token: callback.refreshToken,
          });
          if (!current()) return;
          if (error) throw error;
          sessionRestored = true;
          portalSaasSessionRestored();
          void getPortalQueryClient().invalidateQueries();
        }
        discardTokens();
        publishRef.current({ ...metadata, state: "linked", sessionRestored });
      } catch {
        // A confirmed claim is single-use; retry only session installation after it succeeds.
        if (current())
          publishRef.current({
            ...metadata,
            state: "retry",
            sessionRestored: false,
            reclaim: claim,
            cancel,
          });
      } finally {
        if (!current()) discardTokens();
        busy = false;
      }
    }
  }, [handover, navigate, location.pathname, location.search]);

  return null;
}

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
