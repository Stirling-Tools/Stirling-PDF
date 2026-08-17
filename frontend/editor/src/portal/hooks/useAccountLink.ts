import { useCallback, useEffect, useState } from "react";
import { isSaasSupabaseConfigured } from "@portal/auth/saasSupabase";
import { fetchStatus, unlinkInstance, type LinkStatus } from "@portal/api/link";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";

/**
 * Reads and clears THIS instance's link status.
 *
 * Deliberately does not link. Linking is a browser-mediated handshake started by
 * LinkAccountModal and finished at /account-link/callback, so the admin's Stirling
 * token never passes through this backend and there is nothing for this hook to
 * complete. It reads the resulting status and offers unlink.
 *
 * Subscription state is resolved separately from the wallet, so a linked instance
 * is marked linked-free here.
 */

export type LinkPhase = "idle" | "linking" | "error";

export interface UseAccountLink {
  /** Whether the SaaS Supabase project is configured (false → link UI shows a configure state). */
  loginConfigured: boolean;
  /** Linked / Not-linked status for this instance; null while first loading. */
  status: LinkStatus | null;
  phase: LinkPhase;
  error: string | null;
  /** Unlink this instance. */
  unlink: () => Promise<void>;
}

export function useAccountLink(): UseAccountLink {
  const applyLinkFacts = useApplyLinkFacts();
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [error, setError] = useState<string | null>(null);

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

  /*
   * There was an SSO-return effect here, reading a sessionStorage marker left before an OAuth
   * redirect and finishing the link on the way back. It went with the JWT relay, and it never
   * worked on a real self-hosted host anyway: the provider only redirects to allow-listed URLs, so
   * a customer origin was never returned to. Linking now completes at /account-link/callback, where
   * our own approval page sends the admin.
   */

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
    unlink,
  };
}
