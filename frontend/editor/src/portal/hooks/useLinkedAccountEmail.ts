import { useEffect, useState } from "react";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

/**
 * The email of the linked SaaS account, read from the in-app SaaS Supabase
 * session (the same session the account-link flow establishes). Null when there
 * is no SaaS session — not linked, SaaS Supabase unconfigured, or the attended
 * session has expired — in which case callers treat it as "prefill unavailable"
 * and degrade gracefully.
 *
 * Deliberately does NOT depend on LinkContext: the SaaS flavor has no
 * LinkProvider (see usePortalLinked's SaaS shadow), and this hook is reached from
 * shared procurement code compiled into every flavor.
 */
export function useLinkedAccountEmail(): string | null {
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
  }, []);

  return email;
}
