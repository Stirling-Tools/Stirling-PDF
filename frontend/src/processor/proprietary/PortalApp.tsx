import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PortalAuthBoundary } from "@processor/auth/PortalAuthBoundary";
import { ThemeProvider, useTheme } from "@processor/contexts/ThemeContext";
import { SuiProvider } from "@processor/theme/SuiProvider";
import { PortalProviders } from "@processor/PortalProviders";
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
 * The portal, mounted as a route-set under /processor/* inside the editor app
 * (via the admin-route seam). Session-wide state (auth, app config, licence,
 * tool registry) comes from the PlatformProviders above the frame; this adds
 * only what the portal owns, and NOT a router — the editor's <BrowserRouter> is
 * the one and only router; the portal's routes are relative to the /processor
 * mount (see ViewRouter).
 *
 * The provider stack itself is a per-flavor seam (see {@link PortalProviders}):
 * self-hosted mounts the account-link layer, SaaS does not.
 */
export function PortalApp() {
  const queryClient = getPortalQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedSuiProvider>
          {/* Scopes base.css to the portal so it doesn't restyle the host editor. */}
          <div className="portal-scope">
            <PortalAuthBoundary>
              <PortalProviders />
            </PortalAuthBoundary>
          </div>
        </ThemedSuiProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
