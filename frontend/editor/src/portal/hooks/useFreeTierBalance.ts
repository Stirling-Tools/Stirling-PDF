import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@app/auth";
import { fetchFreeTier } from "@portal/api/link";
import { useConnectGate } from "@portal/hooks/useConnectGate";
import { qk } from "@portal/queries/keys";
import {
  FREE_TIER_EXHAUSTED_EVENT,
  clearAccountLinkBlock,
} from "@app/services/accountLinkBlock";

/** Admin-only local ledger; refreshes after a block and at rollover without reading a cloud wallet. */
export function useFreeTierBalance() {
  const { isAdmin } = useAuth();
  const { gated, loading } = useConnectGate();
  const client = useQueryClient();
  const enabled = isAdmin && gated && !loading;
  const query = useQuery({
    queryKey: qk.freeTier(),
    queryFn: fetchFreeTier,
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

  useEffect(() => {
    if (
      enabled &&
      query.isSuccess &&
      query.data &&
      !query.isFetching &&
      query.data.remainingUnits > 0
    ) {
      clearAccountLinkBlock();
    }
  }, [
    enabled,
    query.data,
    query.dataUpdatedAt,
    query.isFetching,
    query.isSuccess,
  ]);

  return {
    ...query,
    data: enabled ? query.data : undefined,
  };
}
