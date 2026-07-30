import { useQuery } from "@tanstack/react-query";
import type { GroupEnabledResult } from "@app/types/groupEnabled";
import { editorQk } from "@app/queries/keys";
import { fetchGroupEnabled } from "@app/queries/endpoints";

export type { GroupEnabledResult };

export function useGroupEnabled(group: string): GroupEnabledResult {
  const query = useQuery({
    queryKey: editorQk.groupEnabled(group),
    queryFn: () => fetchGroupEnabled(group),
    enabled: !!group,
  });

  if (!group) return { enabled: null, unavailableReason: null };
  if (query.isPending) return { enabled: null, unavailableReason: null };
  if (query.isError) return { enabled: false, unavailableReason: null };
  return { enabled: query.data ?? false, unavailableReason: null };
}
