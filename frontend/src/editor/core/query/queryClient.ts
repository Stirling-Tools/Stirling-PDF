import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

// networkMode "always": navigator.onLine tracks the internet, not a backend on
// 127.0.0.1 or the LAN. On the default, losing Wi-Fi strands every query.
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
