import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@app/auth";
import { fetchFreeTier } from "@portal/api/link";
import { useConnectGate } from "@portal/hooks/useConnectGate";
import { qk } from "@portal/queries/keys";
import {
  FREE_TIER_EXHAUSTED_EVENT,
  clearBlockIfAllowanceRemains,
} from "@app/services/accountLinkBlock";

/** Admin-only local ledger; refreshes after a block and at rollover without reading a cloud wallet. */
export function useFreeTierBalance() {
  const { isAdmin } = useAuth();
  const { gated, loading } = useConnectGate();
  const client = useQueryClient();
  const enabled = isAdmin && gated && !loading;
  const query = useQuery({
    queryKey: qk.freeTier(),
    queryFn: async ({ signal }) => {
      const balance = await fetchFreeTier();
      clearBlockIfAllowanceRemains(balance, signal);
      return balance;
    },
    enabled,
    refetchInterval: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: qk.freeTier() });
    };
    window.addEventListener(FREE_TIER_EXHAUSTED_EVENT, refresh);
    return () => window.removeEventListener(FREE_TIER_EXHAUSTED_EVENT, refresh);
  }, [client, enabled]);

  // Named rather than spread: reading every field subscribes the caller to
  // isFetching too, which flips twice a poll and re-rendered the connect rail
  // for polls that found the same balance.
  return {
    data: enabled ? query.data : undefined,
    isError: query.isError,
    refetch: query.refetch,
  };
}
