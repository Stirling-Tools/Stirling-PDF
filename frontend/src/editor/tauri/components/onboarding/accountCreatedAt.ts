import { useEffect, useState } from "react";
import { useAuth } from "@editor/auth/UseSession";
import { getAccessToken } from "@editor/auth/session";
import { supabase } from "@editor/auth/supabase";
import { useSaaSMode } from "@editor/hooks/useSaaSMode";
import type { AccountCreatedAt } from "@editor-cloud/components/onboarding/accountCreatedAt";

export type { AccountCreatedAt } from "@editor-cloud/components/onboarding/accountCreatedAt";

/** The desktop session is a bare JWT, so the creation date comes from Supabase.
 * Self-hosted accounts carry no creation date and resolve to null. */
export function useAccountCreatedAt(): AccountCreatedAt {
  const isSaaSMode = useSaaSMode();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<AccountCreatedAt>({
    loading: true,
    createdAt: null,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isSaaSMode || !userId) {
      setState({ loading: false, createdAt: null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, createdAt: null });
    void (async () => {
      const token = await getAccessToken();
      const { data } = token
        ? await supabase.auth.getUser(token)
        : { data: { user: null } };
      if (cancelled) return;
      const createdAt = data.user?.created_at
        ? new Date(data.user.created_at)
        : null;
      setState({ loading: false, createdAt });
    })().catch(() => {
      if (!cancelled) setState({ loading: false, createdAt: null });
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isSaaSMode, userId]);

  return state;
}
