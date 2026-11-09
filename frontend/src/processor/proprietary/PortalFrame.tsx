import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getPortalQueryClient } from "@processor/queryClient";
// Reset + typography, scoped to .portal-scope below.
import "@processor/theme/base.css";

/**
 * What every page the portal mounts inside the editor needs: the portal's query cache (shared, so
 * state loaded on one page shows on another) and its base styles.
 */
export function PortalFrame({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getPortalQueryClient()}>
      {/* Scopes base.css to the portal so it doesn't restyle the host editor. */}
      <div className="portal-scope">{children}</div>
    </QueryClientProvider>
  );
}
