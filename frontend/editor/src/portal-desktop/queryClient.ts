import { QueryClient } from "@tanstack/react-query";
import { baseQueryOptions } from "@app/query/queryClient";
import { connectionIdentityKey } from "@app/services/connectionIdentity";

let current: { identity: string; client: QueryClient } | null = null;

/**
 * Desktop: one client per connection rather than per session. The web relies on
 * sign-out reloading the page; desktop switches server, account and mode in
 * place, so a session-wide client would serve the previous connection's roster,
 * pipelines and wallet. A new identity gets a new, empty client.
 */
export function getPortalQueryClient(): QueryClient {
  const identity = connectionIdentityKey();
  if (current?.identity !== identity) {
    current?.client.clear();
    current = {
      identity,
      client: new QueryClient({
        defaultOptions: { queries: baseQueryOptions },
      }),
    };
  }
  return current.client;
}

/** Null until a processor surface first mounts, or after the connection changed. */
export function tryGetPortalQueryClient(): QueryClient | null {
  return current?.identity === connectionIdentityKey() ? current.client : null;
}

/** For tests, which need a cold start between cases. */
export function resetPortalQueryClient(): void {
  current = null;
}
