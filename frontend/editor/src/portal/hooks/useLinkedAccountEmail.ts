import { useEffect, useState } from "react";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

/**
 * Current browser SaaS identity, independent of the local server login or connection owner.
 * Null means no email is available. Tracks sign-in and sign-out without depending on LinkContext.
 */
export function useLinkedAccountEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sessionChanged = false;
    const supabase = ensureSaasSupabase();
    if (!supabase) {
      setEmail(null);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionChanged = true;
      if (!cancelled) setEmail(session?.user?.email ?? null);
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled && !sessionChanged)
          setEmail(data.session?.user?.email ?? null);
      })
      .catch(() => {
        if (!cancelled && !sessionChanged) setEmail(null);
      });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return email;
}
