import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

// networkMode "always": navigator.onLine tracks the internet, not a backend on
// 127.0.0.1 or the LAN. On the default, losing Wi-Fi strands every query.
export const baseQueryOptions: DefaultOptions["queries"] = {
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  // Retry once on transient failures, but never on a 4xx: an auth/forbidden/not-found
  // response won't change on a second identical request, so retrying just doubles the
  // wait (e.g. a 403 firing twice) before the UI settles.
  retry: (failureCount, error) => {
    const status = (error as { status?: number } | null)?.status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return false;
    }
    return failureCount < 1;
  },
  networkMode: "always",
  refetchOnWindowFocus: false,
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: baseQueryOptions } });
}
