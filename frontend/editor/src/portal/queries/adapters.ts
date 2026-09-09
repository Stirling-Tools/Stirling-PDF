import type { UseQueryResult } from "@tanstack/react-query";
import type { AsyncState } from "@portal/hooks/useAsync";

/**
 * Adapt a query result to the {@link AsyncState} shape the views already use
 * (data/loading/error + useSectionFlags), so a hook swaps in with no render
 * changes. `isPending` is false once data is cached, so a remount renders from
 * cache instead of flashing a skeleton.
 */
export function toAsyncState<T>(query: UseQueryResult<T>): AsyncState<T> {
  return {
    data: query.data ?? null,
    loading: query.isPending,
    error: (query.error as Error | null) ?? null,
  };
}
