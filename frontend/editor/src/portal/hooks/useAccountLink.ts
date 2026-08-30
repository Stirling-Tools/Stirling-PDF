import { useCallback, useEffect, useState } from "react";
import { isSaasSupabaseConfigured } from "@portal/auth/saasSupabase";
import { fetchStatus, unlinkInstance, type LinkStatus } from "@portal/api/link";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";

/** Reads and clears THIS instance's link status. */

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
  /** Re-read the status, for when something outside this hook changed it. */
  refresh: () => Promise<void>;
}

export function useAccountLink(): UseAccountLink {
  const applyLinkFacts = useApplyLinkFacts();
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setStatus(s);
      // A linked instance is at least linked-free; subscription comes from the wallet.
      if (s.linked) applyLinkFacts(true, false);
    } catch {
      setStatus({ linked: false, name: null });
    }
  }, [applyLinkFacts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    refresh,
  };
}
