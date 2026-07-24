import { QueryClient } from "@tanstack/react-query";

/**
 * The portal's TanStack Query client, mounted once at the portal root
 * (PortalApp) so its cache lives above the router — data survives navigating
 * away and back. staleTime 30s: a return visit within 30s serves cache with no
 * network call, then revalidates in the background. Focus refetch is off — admin
 * screens don't need polling.
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
