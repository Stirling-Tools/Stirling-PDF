import { useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshWalletCache } from "@app/portal/api/billing";
import { triggerLocalSync } from "@app/portal/api/link";
import { qk } from "@app/portal/queries/keys";

/** Holds the ask across a route change; the backend's own throttle is what bounds the rest. */
const REASK_AFTER_MS = 60_000;

/**
 * Reports this instance's unsynced usage to SaaS when the billing page opens, then re-reads the
 * wallet so the page renders the meter's own figures rather than the portal's arithmetic on a
 * stale snapshot.
 *
 * <p>Usage is otherwise reported on a daily schedule and the page adds the local remainder on top,
 * which keeps the unit total honest but not the rest of it: pending units carry no document count,
 * no size multiplier and no share of the free grant, so PDFs processed, the grant remainder and
 * the estimated bill are all approximations until SaaS has seen the work.
 *
 * <p>Asking is cheap and the backend decides. A reload builds a new query cache, so the staleness
 * below only holds within a session — what stops a reload loop from becoming a report loop is the
 * throttle on {@code sync-now}, and the refusal it answers with is why nothing downstream runs:
 * no report went out, so there is no snapshot worth dropping and nothing to re-read.
 *
 * <p>Best-effort, and silent either way. A sync that fails leaves the page exactly as it rendered
 * before — already correct on the headline figure — so there is nothing to report to the operator.
 *
 * @param enabled false wherever there is no local instance to sync (hosted SaaS).
 */
export function useLocalUsageSync(enabled: boolean): void {
  const queryClient = useQueryClient();
  useQuery({
    queryKey: qk.localSync(),
    queryFn: async () => {
      const now = Date.now();
      if (!(await triggerLocalSync())) return now;
      try {
        // The wallet is served from a ~30s snapshot, so dropping it is what makes the
        // units we just reported visible to the read that follows.
        await refreshWalletCache();
      } catch {
        // The snapshot expires on its own; the next poll picks the figures up.
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.wallet(true) }),
        queryClient.invalidateQueries({ queryKey: qk.localUsage() }),
      ]);
      return now;
    },
    enabled,
    staleTime: REASK_AFTER_MS,
    gcTime: REASK_AFTER_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
