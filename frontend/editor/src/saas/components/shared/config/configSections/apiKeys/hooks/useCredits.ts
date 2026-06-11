import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@app/auth/UseSession";
import { ApiCredits } from "@app/types/credits";
import { isUserAnonymous } from "@app/auth/supabase";

export function useCredits() {
  const { session, loading, user } = useAuth();
  const isAnonymous = Boolean(user && isUserAnonymous(user));
  // Gutted hook (legacy /api/v1/credits is dead) — these stay at their initial values; only
  // hasAttempted toggles, so the rest have no setters.
  const [data] = useState<ApiCredits | null>(null);
  const [isLoading] = useState<boolean>(false);
  const [error] = useState<Error | null>(null);
  const [hasAttempted, setHasAttempted] = useState<boolean>(false);

  // Legacy weekly-credits endpoint (/api/v1/credits) is dead. PAYG replaces this — the
  // wallet hook (useWallet) carries the equivalent state via /api/v1/payg/wallet. The
  // hook surface is preserved for the ApiKeys page consumer (it destructures `data`,
  // `isLoading`, `error`, `refetch`, `hasAttempted`), but `data` always stays null —
  // the consumer's usage widget will render its "no data" state.
  const fetchCredits = useCallback(async () => {
    setHasAttempted(true);
  }, []);

  useEffect(() => {
    if (!loading && session && !hasAttempted && !isAnonymous) {
      setHasAttempted(true);
    }
  }, [loading, session, hasAttempted, isAnonymous]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchCredits,
    hasAttempted,
  } as const;
}

export default useCredits;
