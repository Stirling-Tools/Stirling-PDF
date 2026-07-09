import { type ReactNode } from "react";
import { PortalAuthBoundary } from "@portal/auth/PortalAuthBoundary";
import { ThemeProvider, useTheme } from "@portal/contexts/ThemeContext";
import { SuiProvider } from "@portal/theme/SuiProvider";
import { PortalProviders } from "@portal/PortalProviders";
// Reset + typography, scoped to .portal-scope below.
import "@portal/theme/base.css";

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
 * The portal, mounted as a route-set under /portal/* inside the editor app (via
 * the admin-route seam). It supplies its own providers and its own i18next
 * instance (the `portal` namespace), but NOT a router — the editor's
 * <BrowserRouter> is the one and only router; the portal's routes are relative
 * to the /portal mount (see ViewRouter).
 *
 * The provider stack itself is a per-flavor seam (see {@link PortalProviders}):
 * self-hosted mounts the account-link layer, SaaS does not.
 */
export function PortalApp() {
  return (
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
  );
}
