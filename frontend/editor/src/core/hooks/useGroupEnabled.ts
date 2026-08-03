import { useQuery } from "@tanstack/react-query";
import apiClient from "@app/services/apiClient";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";
import type { GroupEnabledResult } from "@app/types/groupEnabled";

export type { GroupEnabledResult };

/** Shared with the desktop override, which adds an offline short-circuit. */
export async function fetchGroupEnabled(group: string): Promise<boolean> {
  const res = await apiClient.get<boolean>(
    `/api/v1/config/group-enabled?group=${encodeURIComponent(group)}`,
  );
  return res.data;
}

/**
 * Checks whether a named feature group is enabled on the backend.
 * Returns { enabled: null } while loading, then true/false with an optional reason.
 *
 * Cached per group, so the same group asked for from several panels costs one
 * request where previously every mount re-fetched.
 */
export function useGroupEnabled(group: string): GroupEnabledResult {
  const { data, isPending } = useQuery({
    queryKey: qk.groupEnabled(group),
    queryFn: () => fetchGroupEnabled(group),
    staleTime: CONFIG_STALE_TIME,
  });

  return {
    // A failed check reads as disabled, matching the previous catch handler.
    enabled: isPending ? null : (data ?? false),
    unavailableReason: null,
  };
}
