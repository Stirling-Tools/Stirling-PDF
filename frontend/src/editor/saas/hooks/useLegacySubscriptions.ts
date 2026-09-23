import { useCallback, useEffect, useRef, useState } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@app/auth/UseSession";
import { openExternal } from "@app/platform/openExternal";
import { qk } from "@app/query/keys";
import {
  createLegacyPortalSession,
  fetchLegacySubscriptions,
} from "@app/services/legacyBilling";
import type { LegacyBillingState } from "@app/types/legacyBilling";

const REFRESH_INTERVAL_MS = 30_000;

/** Keeps historical billing separate from wallet allowances and current team membership. */
export function useLegacySubscriptions(): LegacyBillingState {
  const { user, loading: authLoading } = useAuth();
  const userId = !authLoading && user && !user.is_anonymous ? user.id : null;
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: qk.legacySubscriptions(userId),
    queryFn: userId ? () => fetchLegacySubscriptions(userId) : skipToken,
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const [opening, setOpening] = useState(false);
  const [portalError, setPortalError] = useState(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const refresh = useCallback(() => {
    if (userId) void refetch();
  }, [userId, refetch]);

  useEffect(() => {
    setPortalError(false);
  }, [userId]);

  const subscriptions = userId ? (data ?? []) : [];
  const openPortal = async () => {
    if (!userId || !subscriptions.length || opening) return;
    setOpening(true);
    setPortalError(false);
    try {
      const url = await createLegacyPortalSession();
      if (currentUser.current === userId) {
        // A return from Stripe must revalidate even inside the normal freshness window.
        await queryClient.invalidateQueries({
          queryKey: qk.legacySubscriptions(userId),
          refetchType: "none",
        });
        if (currentUser.current === userId) await openExternal(url);
      }
    } catch {
      if (currentUser.current === userId) setPortalError(true);
    } finally {
      setOpening(false);
    }
  };

  return {
    subscriptions,
    loading: authLoading || Boolean(userId && isPending),
    loadError: Boolean(userId && isError && data === undefined),
    opening,
    portalError,
    refresh,
    openPortal,
  };
}
