import { QueryClient } from "@tanstack/react-query";
import { baseQueryOptions } from "@editor/query/queryClient";

let current: QueryClient | null = null;

/**
 * One client for the session, not one per mount. The portal is a route, so
 * switching to the editor unmounts it, and a per-mount client would throw the
 * cache away and refetch everything on the way back.
 *
 * Still a separate instance from the platform's (see PlatformProviders): the
 * portal invalidates and clears its own cache without touching the app config
 * or the editor's.
 */
export function getPortalQueryClient(): QueryClient {
  current ??= new QueryClient({
    defaultOptions: { queries: baseQueryOptions },
  });
  return current;
}

/** Null until the portal first mounts, so resolveTeam can fall back to a direct fetch. */
export function tryGetPortalQueryClient(): QueryClient | null {
  return current;
}

/**
 * Drops the cache and the instance holding it. For tests, which need a cold
 * start between cases; the app never calls it, because signing out is a full
 * page load.
 */
export function resetPortalQueryClient(): void {
  current = null;
}
