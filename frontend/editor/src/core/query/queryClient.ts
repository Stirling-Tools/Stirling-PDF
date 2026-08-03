import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

/**
 * Query defaults shared by every build.
 *
 * `networkMode: "always"` because `navigator.onLine` describes internet
 * reachability, which says nothing about the backends this app talks to — a
 * bundled backend on 127.0.0.1, or a self-hosted server on the LAN. Left on
 * Query's default, losing Wi-Fi strands every query in a permanent pending
 * state against a backend that is up and answering.
 *
 * Focus refetch is off because the editor is a workbench, not a dashboard:
 * re-firing config queries every time the user alts back buys nothing.
 */
export const baseQueryOptions: DefaultOptions["queries"] = {
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  retry: 1,
  networkMode: "always",
  refetchOnWindowFocus: false,
};

/** Mounted once at the top of AppProviders so the cache outlives navigation. */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: baseQueryOptions } });
}
