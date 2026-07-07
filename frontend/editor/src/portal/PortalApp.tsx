import { type ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { PortalAuthBoundary } from "@portal/auth/PortalAuthBoundary";
import { ThemeProvider, useTheme } from "@portal/contexts/ThemeContext";
import { mantineTheme } from "@portal/theme/mantineTheme";
import { PortalProviders } from "@portal/PortalProviders";
// Reset + typography, scoped to .portal-scope below.
import "@portal/theme/base.css";

/**
 * Binds Mantine's colour scheme to the portal's own ThemeProvider so Mantine
 * components follow the same light/dark switch as the SUI primitives. Must sit
 * inside <ThemeProvider> to read useTheme().
 */
function PortalMantineProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <MantineProvider theme={mantineTheme} forceColorScheme={theme}>
      {children}
    </MantineProvider>
  );
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
      <PortalMantineProvider>
        {/* Scopes base.css to the portal so it doesn't restyle the host editor. */}
        <div className="portal-scope">
          <PortalAuthBoundary>
            <PortalProviders />
          </PortalAuthBoundary>
        </div>
      </PortalMantineProvider>
    </ThemeProvider>
  );
}
