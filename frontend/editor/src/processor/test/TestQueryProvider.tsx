import { useState, type ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Wraps a processor component under test in a fresh QueryClient (retries off for
 * deterministic tests). Needed by any test that renders a component using the
 * shared query hooks (processor/queries/*). Mirror of the QueryClientProvider the
 * app mounts at ProcessorApp.
 */
export function TestQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Combined provider for processor component tests: QueryClient + Mantine. Drop-in
 * replacement for a bare `MantineProvider` test wrapper once a component (or a
 * child) uses the shared query hooks.
 */
export function ProcessorTestProviders({ children }: { children: ReactNode }) {
  return (
    <TestQueryProvider>
      <MantineProvider>{children}</MantineProvider>
    </TestQueryProvider>
  );
}
