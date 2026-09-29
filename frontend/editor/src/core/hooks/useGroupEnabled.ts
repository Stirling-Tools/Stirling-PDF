import { useQuery } from "@tanstack/react-query";
import { fetchGroupEnabled } from "@app/api/config";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";
import type { GroupEnabledResult } from "@app/types/groupEnabled";

export type { GroupEnabledResult };

/** Null while loading; a failed check reads as disabled. */
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
