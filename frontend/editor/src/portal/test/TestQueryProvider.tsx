import { useState, type ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkProvider, type LinkState } from "@portal/contexts/LinkContext";
import { UIProvider } from "@portal/contexts/UIContext";

/**
 * Wraps a portal component under test in a fresh QueryClient (retries off for
 * deterministic tests). Needed by any test that renders a component using the
 * shared query hooks (portal/queries/*). Mirror of the QueryClientProvider the
 * app mounts at PortalApp.
 */
export function TestQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Combined provider for portal component tests: QueryClient + Mantine. Drop-in
 * replacement for a bare `MantineProvider` test wrapper once a component (or a
 * child) uses the shared query hooks.
 */
export function PortalTestProviders({ children }: { children: ReactNode }) {
  return (
    <TestQueryProvider>
      <MantineProvider>{children}</MantineProvider>
    </TestQueryProvider>
  );
}

/** {@link PortalTestProviders} plus the contexts the connect gate reads. Unlinked by default. */
export function PortalViewProviders({
  children,
  linkState = "unlinked",
}: {
  children: ReactNode;
  linkState?: LinkState;
}) {
  return (
    <PortalTestProviders>
      <LinkProvider initialState={linkState}>
        <UIProvider>{children}</UIProvider>
      </LinkProvider>
    </PortalTestProviders>
  );
}
