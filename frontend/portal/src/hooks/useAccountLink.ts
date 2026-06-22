import { useCallback, useEffect, useState } from "react";
import {
  isSaasLoginConfigured,
  openSaasLoginPopup,
  type SaasSession,
} from "@portal/auth/supabaseLink";
import {
  fetchStatus,
  linkInstance,
  unlinkInstance,
  type LinkStatus,
} from "@portal/api/link";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";

/**
 * Orchestrates the account-link flow for THIS instance:
 *
 *   1. Open the hosted SaaS login popup (auth/supabaseLink.ts) — SSO or
 *      create-account, no bespoke form.
 *   2. Receive the SaaS JWT it posts back (origin-validated).
 *   3. POST the JWT to the LOCAL backend (api/link.ts) which registers with SaaS
 *      and stores the device secret server-side.
 *   4. Read the resulting Linked / Not-linked status.
 *
 * The device secret is never received or rendered here. Subscription state is
 * resolved separately from the wallet, so a fresh link marks the org linked-free.
 *
 * When VITE_SAAS_WEB_URL is unset the popup degrades to a dev stub (see
 * auth/supabaseLink.ts) that simulates the SaaS page posting back a session, so
 * the flow stays demoable + testable.
 */

export type LinkPhase = "idle" | "linking" | "error";

export interface UseAccountLink {
  /** Whether the hosted SaaS login URL is configured (false → uses dev stub). */
  loginConfigured: boolean;
  /** Linked / Not-linked status for this instance; null while first loading. */
  status: LinkStatus | null;
  phase: LinkPhase;
  error: string | null;
  /** Open the SaaS login popup and link this instance with the returned JWT. */
  link: (name?: string) => Promise<void>;
  /** Unlink this instance. */
  unlink: () => Promise<void>;
  /**
   * DEV/TEST seam: when set, link() routes the popup through this stub instead of
   * a real window.open (see auth/supabaseLink.ts OpenPopupOptions.stub).
   */
  loginStub?: (post: (session: SaasSession) => void) => void;
}

export interface UseAccountLinkOptions {
  loginStub?: (post: (session: SaasSession) => void) => void;
}

export function useAccountLink(
  opts: UseAccountLinkOptions = {},
): UseAccountLink {
  const applyLinkFacts = useApplyLinkFacts();
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  // Read the current link status on mount.
  useEffect(() => {
    let cancelled = false;
    void fetchStatus().then((s) => {
      if (!cancelled) {
        setStatus(s);
        // A linked instance is at least linked-free; subscription comes from the wallet.
        if (s.linked) applyLinkFacts(true, false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [applyLinkFacts]);

  const link = useCallback(
    async (name?: string) => {
      setPhase("linking");
      setError(null);
      try {
        // Dev/Storybook fallback: with no real SaaS login URL configured,
        // simulate the popup posting back a session so the flow stays demoable.
        const stub =
          opts.loginStub ??
          (!isSaasLoginConfigured && import.meta.env.DEV
            ? (post: (session: SaasSession) => void) =>
                post({ access_token: "dev-stub-jwt" })
            : undefined);
        const session = await openSaasLoginPopup({ stub });
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
    [opts.loginStub, applyLinkFacts],
  );

  const unlink = useCallback(async () => {
    setPhase("linking");
    setError(null);
    try {
      const next = await unlinkInstance();
      setStatus(next);
      setPhase("idle");
      applyLinkFacts(false, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [applyLinkFacts]);

  return {
    loginConfigured: isSaasLoginConfigured,
    status,
    phase,
    error,
    link,
    unlink,
    loginStub: opts.loginStub,
  };
}
