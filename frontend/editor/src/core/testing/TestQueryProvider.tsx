import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Wraps a component under test in a fresh QueryClient. Retries are off so a
 * failing request surfaces immediately instead of after backoff, and gcTime is
 * Infinity so nothing is collected mid-assertion.
 *
 * Needed by any test that renders a component using a query hook — without it
 * the hook throws "No QueryClient set". Mirror of the provider AppProviders
 * mounts. (The portal has its own equivalent in portal/test/TestQueryProvider;
 * the two collapse when the portal moves onto the shared client.)
 */
export function TestQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: Infinity },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
