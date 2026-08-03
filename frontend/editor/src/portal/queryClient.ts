import { QueryClient } from "@tanstack/react-query";
import { baseQueryOptions } from "@app/query/queryClient";

let current: QueryClient | null = null;

/**
 * The portal's client, mounted at PortalApp. Separate instance from the
 * editor's — the two mount as sibling routes, never in one tree — but the same
 * defaults, so behaviour can't drift between the products.
 */
export function createPortalQueryClient(): QueryClient {
  current = new QueryClient({ defaultOptions: { queries: baseQueryOptions } });
  return current;
}

/**
 * Null until the portal has mounted. Lets the SaaS usersBackend's resolveTeam
 * share the cache when it can, and fall back to a direct fetch when there is no
 * portal (e.g. a unit test exercising the adapter without the provider).
 */
export function tryGetPortalQueryClient(): QueryClient | null {
  return current;
}
