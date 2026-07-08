import { useEffect, useState } from "react";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";
import { useLink } from "@portal/contexts/LinkContext";

/**
 * The email of the linked SaaS account, read from the in-app SaaS Supabase
 * session (the same session the account-link flow establishes). Null when there
 * is no SaaS session — not linked, SaaS Supabase unconfigured, or the attended
 * session has expired — in which case callers treat it as "prefill unavailable"
 * and degrade gracefully. Refreshes when the SaaS session changes (a re-auth
 * bumps LinkContext's saasSessionNonce).
 */
export function useLinkedAccountEmail(): string | null {
  const { saasSessionNonce } = useLink();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = ensureSaasSupabase();
    if (!supabase) {
      setEmail(null);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setEmail(data.session?.user?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [saasSessionNonce]);

  return email;
}
