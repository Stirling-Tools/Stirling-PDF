import { QueryClient } from "@tanstack/react-query";

/**
 * The portal's TanStack Query client. Mounted once at the portal root
 * (PortalApp) so its cache lives ABOVE the view router — data fetched on one
 * view survives navigating away and back, which is the whole point of the
 * before/after evaluation (see the `reactQuery` dev flag).
 *
 * Defaults chosen for the portal's admin workloads:
 *   - staleTime 30s   — returning to a view within 30s serves cache with NO
 *                       network call; after that it revalidates in the
 *                       background while showing the cached data.
 *   - gcTime 5m       — unused view data is dropped after 5 minutes idle.
 *   - retry 1         — one retry on failure (the hand-rolled useAsync did none).
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
 * The client created by {@link createPortalQueryClient} (PortalApp mounts one
 * for the portal's lifetime). Lets non-hook modules — e.g. the SaaS
 * usersBackend's resolveTeam — read/populate the shared cache via
 * ensureQueryData. Throws if called before the provider is mounted; tests that
 * build their own client must call createPortalQueryClient() so this points at
 * the same instance the provider uses.
 */
export function getPortalQueryClient(): QueryClient {
  if (!current) {
    throw new Error(
      "Portal query client not created — createPortalQueryClient() must run first (PortalApp mounts it).",
    );
  }
  return current;
}

/**
 * Like {@link getPortalQueryClient} but returns null instead of throwing when
 * no provider is mounted. For non-hook modules that can run outside the portal
 * shell (e.g. a backend adapter exercised directly in a unit test) and want to
 * use the shared cache when it exists but still work without it.
 */
export function tryGetPortalQueryClient(): QueryClient | null {
  return current;
}
