import { QueryClient } from "@tanstack/react-query";

/**
 * The editor's TanStack Query client, mounted once at the top of AppProviders
 * so its cache sits above the router and survives navigation.
 *
 * Defaults mirror the portal's client (see portal/queryClient.ts): a 30s
 * staleTime so a remount within that window renders from cache and revalidates
 * in the background, and no focus refetch — the editor is a workbench, not a
 * dashboard, and re-firing every config query on tab focus buys nothing.
 *
 * Individual queries override staleTime per the tiers in core/query/keys.ts.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
