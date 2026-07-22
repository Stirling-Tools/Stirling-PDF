import { QueryClient } from "@tanstack/react-query";

/**
 * The portal's TanStack Query client. Mounted once at the portal root
 * (PortalApp) so its cache lives ABOVE the view router — data fetched on one
 * view survives navigating away and back.
 *
 * Defaults chosen for the portal's admin workloads:
 *   - staleTime 30s   — returning to a view within 30s serves cache with NO
 *                       network call; after that it revalidates in the
 *                       background while showing the cached data.
 *   - gcTime 5m       — unused view data is dropped after 5 minutes idle.
 *   - retry 1         — one retry on failure.
 *   - no refetch on window focus — admin screens don't need focus polling.
 */
let current: QueryClient | null = null;

export function createPortalQueryClient(): QueryClient {
  current = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
  return current;
}

/**
 * The client created by {@link createPortalQueryClient}, or null if none has
 * been mounted yet. Lets a non-hook module (the SaaS usersBackend's resolveTeam)
 * read/populate the shared cache via ensureQueryData when the portal is mounted,
 * while still working — via a direct fetch — when it isn't (e.g. a unit test
 * that exercises the adapter without the provider).
 */
export function tryGetPortalQueryClient(): QueryClient | null {
  return current;
}
