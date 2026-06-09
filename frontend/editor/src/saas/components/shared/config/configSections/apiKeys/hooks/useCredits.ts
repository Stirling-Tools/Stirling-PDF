import { useCallback, useEffect, useState } from "react";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { ApiCredits } from "@app/types/credits";
import { isUserAnonymous } from "@app/auth/supabase";

function coerceNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCredits(raw: Record<string, unknown>): ApiCredits {
  // Accept a variety of possible backend keys to be resilient
  return {
    weeklyCreditsRemaining: coerceNumber(
      raw?.weeklyCreditsRemaining ?? raw?.weeklyRemaining ?? raw?.weekly_left,
    ),
    weeklyCreditsAllocated: coerceNumber(
      raw?.weeklyCreditsAllocated ?? raw?.weeklyAllocated ?? raw?.weekly_total,
    ),
    boughtCreditsRemaining: coerceNumber(
      raw?.boughtCreditsRemaining ?? raw?.boughtRemaining ?? raw?.bought_left,
    ),
    totalBoughtCredits: coerceNumber(
      raw?.totalBoughtCredits ?? raw?.boughtTotal ?? raw?.bought_total,
    ),
    totalAvailableCredits: coerceNumber(
      raw?.totalAvailableCredits ?? raw?.totalRemaining ?? raw?.available_total,
    ),
    weeklyResetDate: String(
      raw?.weeklyResetDate ?? raw?.weeklyReset ?? raw?.reset_date ?? "",
    ),
    lastApiUsage: String(
      raw?.lastApiUsage ?? raw?.lastApiUse ?? raw?.last_used_at ?? "",
    ),
  };
}

export function useCredits() {
  const { session, loading, user } = useAuth();
  const isAnonymous = Boolean(user && isUserAnonymous(user));
  const [data, setData] = useState<ApiCredits | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
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
