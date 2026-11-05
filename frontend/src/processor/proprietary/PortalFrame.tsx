import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useTheme } from "@editor/components/shared/ThemeProvider";
import { SuiProvider } from "@processor/theme/SuiProvider";
import { getPortalQueryClient } from "@processor/queryClient";
// Reset + typography, scoped to .portal-scope below.
import "@processor/theme/base.css";

function ThemedSuiProvider({ children }: { children: ReactNode }) {
  const { colorScheme } = useTheme();
  return <SuiProvider colorScheme={colorScheme}>{children}</SuiProvider>;
}

/**
 * What every page the portal mounts inside the editor needs: the portal's query cache (shared, so
 * state loaded on one page shows on another), its design system, and its base styles.
 */
export function PortalFrame({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getPortalQueryClient()}>
      <ThemedSuiProvider>
        {/* Scopes base.css to the portal so it doesn't restyle the host editor. */}
        <div className="portal-scope">{children}</div>
      </ThemedSuiProvider>
    </QueryClientProvider>
  );
}
