import type { UseQueryResult } from "@tanstack/react-query";
import type { AsyncState } from "@portal/hooks/useAsync";

/**
 * Adapt a TanStack query result to the portal's {@link AsyncState} shape, so
 * views built against useAsync (data/loading/error + useSectionFlags) consume a
 * query hook with no render changes.
 *
 * `isPending` is true only while there's no cached data — a cached remount
 * renders instantly and a background revalidation keeps the stale data on
 * screen (matching the legacy `loading && data === null`).
 */
export function toAsyncState<T>(query: UseQueryResult<T>): AsyncState<T> {
  return {
    data: query.data ?? null,
    loading: query.isPending,
    error: (query.error as Error | null) ?? null,
  };
}
