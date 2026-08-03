import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

/**
 * Query defaults for every client in the app, editor and Processor alike.
 *
 * networkMode "always" because navigator.onLine tracks internet reachability,
 * which says nothing about a bundled backend on 127.0.0.1 or a self-hosted
 * server on the LAN. On Query's default, losing Wi-Fi strands every query
 * pending against a backend that is up.
 */
export const baseQueryOptions: DefaultOptions["queries"] = {
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  retry: 1,
  networkMode: "always",
  refetchOnWindowFocus: false,
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: baseQueryOptions } });
}
