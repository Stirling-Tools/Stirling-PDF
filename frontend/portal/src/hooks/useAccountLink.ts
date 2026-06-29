import { useCallback, useEffect, useState } from "react";
import type { SupabaseLoginSession } from "@shared/auth/ui/useSupabaseLogin";
import {
  ensureSaasSupabase,
  isSaasSupabaseConfigured,
  PENDING_LINK_KEY,
} from "@portal/auth/saasSupabase";
import {
  fetchStatus,
  linkInstance,
  unlinkInstance,
  type LinkStatus,
} from "@portal/api/link";
import { useApplyLinkFacts, useLink } from "@portal/contexts/LinkContext";

/**
 * Orchestrates the account-link flow for THIS instance:
 *
 *   1. The admin signs in to their Stirling account IN-APP (LinkAccountModal →
 *      shared Supabase login), minting a short-term SaaS JWT.
 *   2. {@link completeLink} POSTs that JWT to the LOCAL backend (api/link.ts),
 *      which registers with SaaS and stores the device secret server-side.
 *   3. The resulting Linked / Not-linked status is read back.
 *
 * Email/password resolves inline (the modal calls completeLink). SSO redirects
 * the browser to the provider and back; the returned session is finished here on
 * mount (see the pending-link effect). The device secret is never received or
 * rendered. Subscription state is resolved separately from the wallet, so a fresh
 * link marks the org linked-free.
 */

export type LinkPhase = "idle" | "linking" | "error";

export interface UseAccountLink {
  /** Whether the SaaS Supabase project is configured (false → link UI shows a configure state). */
  loginConfigured: boolean;
  /** Linked / Not-linked status for this instance; null while first loading. */
  status: LinkStatus | null;
  phase: LinkPhase;
  error: string | null;
  /** Finish linking THIS instance with a SaaS session minted by the login modal. */
  completeLink: (session: SupabaseLoginSession, name?: string) => Promise<void>;
  /** Unlink this instance. */
  unlink: () => Promise<void>;
}

export function useAccountLink(): UseAccountLink {
  const applyLinkFacts = useApplyLinkFacts();
  const { markSaasSessionChanged } = useLink();
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const completeLink = useCallback(
    async (session: SupabaseLoginSession, name?: string) => {
      setPhase("linking");
      setError(null);
      try {
        const next = await linkInstance({
          supabaseJwt: session.access_token,
          name,
        });
        setStatus(next);
        setPhase("idle");
        if (next.linked) applyLinkFacts(true, false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    },
    [applyLinkFacts],
  );

  // Read the current link status on mount.
  useEffect(() => {
    let cancelled = false;
    void fetchStatus()
      .then((s) => {
        if (!cancelled) {
          setStatus(s);
          // A linked instance is at least linked-free; subscription comes from the wallet.
          if (s.linked) applyLinkFacts(true, false);
        }
      })
      .catch(() => {
        // Status endpoint absent (flag off) / unreachable → leave status null,
        // which renders as "Not linked". Don't surface an error or leak an
        // unhandled rejection for the expected flag-off case.
        if (!cancelled) setStatus({ linked: false, name: null });
      });
    return () => {
      cancelled = true;
    };
  }, [applyLinkFacts]);

  // SSO return: an SSO sign-in we kicked off has redirected back and the SaaS
  // session is now in the shared Supabase client. The pending marker carries the
  // mode: "reauth" only refreshes attended reads (the instance is already linked
  // — re-registering would mint a duplicate credential); anything else links.
  useEffect(() => {
    const supabase = ensureSaasSupabase();
    const pending = sessionStorage.getItem(PENDING_LINK_KEY);
    if (!supabase || pending === null) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      sessionStorage.removeItem(PENDING_LINK_KEY);
      const token = data.session?.access_token;
      if (!token || cancelled) return;
      if (pending === "reauth") {
        markSaasSessionChanged();
      } else {
        void completeLink({ access_token: token });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [completeLink, markSaasSessionChanged]);

  const unlink = useCallback(async () => {
    setPhase("linking");
    setError(null);
    try {
      await unlinkInstance();
      setStatus({ linked: false, name: null });
      setPhase("idle");
      applyLinkFacts(false, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [applyLinkFacts]);

  return {
    loginConfigured: isSaasSupabaseConfigured,
    status,
    phase,
    error,
    completeLink,
    unlink,
  };
}
