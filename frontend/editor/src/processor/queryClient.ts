import { QueryClient } from "@tanstack/react-query";
import { baseQueryOptions } from "@app/query/queryClient";

let current: QueryClient | null = null;

/**
 * One client for the session, not one per mount. The processor is a route, so
 * switching to the editor unmounts it, and a per-mount client would throw the
 * cache away and refetch everything on the way back. The editor's own client
 * sits above the router and never pays that.
 *
 * Still a separate instance from the editor's: the two namespace their keys
 * apart and invalidate independently.
 */
export function getProcessorQueryClient(): QueryClient {
  current ??= new QueryClient({
    defaultOptions: { queries: baseQueryOptions },
  });
  return current;
}

/** Null until the processor first mounts, so resolveTeam can fall back to a direct fetch. */
export function tryGetProcessorQueryClient(): QueryClient | null {
  return current;
}

/**
 * Drops the cache and the instance holding it. For tests, which need a cold
 * start between cases; the app never calls it, because signing out is a full
 * page load.
 */
export function resetProcessorQueryClient(): void {
  current = null;
}
