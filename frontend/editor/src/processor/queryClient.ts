import { QueryClient } from "@tanstack/react-query";
import { baseQueryOptions } from "@app/query/queryClient";

let current: QueryClient | null = null;

/** Own instance, shared defaults — the processor and editor are sibling routes. */
export function createProcessorQueryClient(): QueryClient {
  current = new QueryClient({ defaultOptions: { queries: baseQueryOptions } });
  return current;
}

/** Null until the processor mounts, so resolveTeam can fall back to a direct fetch. */
export function tryGetProcessorQueryClient(): QueryClient | null {
  return current;
}
