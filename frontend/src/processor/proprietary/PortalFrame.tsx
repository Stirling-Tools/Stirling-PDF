import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "@processor/contexts/ThemeContext";
import { SuiProvider } from "@processor/theme/SuiProvider";
import { getPortalQueryClient } from "@processor/queryClient";
// Reset + typography, scoped to .portal-scope below.
import "@processor/theme/base.css";

/**
 * Binds the SUI design system to the portal's own ThemeProvider so the SUI
 * components follow the same light/dark switch as the CSS tokens. Must sit
 * inside <ThemeProvider> to read useTheme().
 */
function ThemedSuiProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <SuiProvider colorScheme={theme}>{children}</SuiProvider>;
}

/**
 * What every page the portal mounts inside the editor needs: the portal's query cache (shared, so
 * state loaded on one page shows on another), its theme and design system, and its base styles.
 */
export function PortalFrame({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getPortalQueryClient()}>
      <ThemeProvider>
        <ThemedSuiProvider>
          {/* Scopes base.css to the portal so it doesn't restyle the host editor. */}
          <div className="portal-scope">{children}</div>
        </ThemedSuiProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
