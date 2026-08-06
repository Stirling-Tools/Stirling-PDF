import { QueryClient } from "@tanstack/react-query";
import { baseQueryOptions } from "@editor/query/queryClient";

let current: QueryClient | null = null;

/** Own instance, shared defaults — the portal and editor are sibling routes. */
export function createPortalQueryClient(): QueryClient {
  current = new QueryClient({ defaultOptions: { queries: baseQueryOptions } });
  return current;
}

/** Null until the portal mounts, so resolveTeam can fall back to a direct fetch. */
export function tryGetPortalQueryClient(): QueryClient | null {
  return current;
}
