import { useQuery } from "@tanstack/react-query";
import { fetchGroupEnabled } from "@app/api/config";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";
import type { GroupEnabledResult } from "@app/types/groupEnabled";

export type { GroupEnabledResult };

/**
 * Checks whether a named feature group is enabled on the backend.
 * Returns { enabled: null } while loading, then true/false with an optional reason.
 */
export function useGroupEnabled(group: string): GroupEnabledResult {
  const { data, isPending } = useQuery({
    queryKey: qk.groupEnabled(group),
    queryFn: () => fetchGroupEnabled(group),
    staleTime: CONFIG_STALE_TIME,
  });

  return {
    enabled: isPending ? null : (data ?? false),
    unavailableReason: null,
  };
}
