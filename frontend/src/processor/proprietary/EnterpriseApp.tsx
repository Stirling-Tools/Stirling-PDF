import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@editor/auth";
import { EnterpriseAuthBoundary } from "@processor/auth/EnterpriseAuthBoundary";
import { ThemeProvider, useTheme } from "@processor/contexts/ThemeContext";
import { SuiProvider } from "@processor/theme/SuiProvider";
import { PortalSettingsProviders } from "@processor/components/settings/PortalSettingsProviders";
import { ErrorBoundary } from "@processor/components/ErrorBoundary";
import { getPortalQueryClient } from "@processor/queryClient";
import { Enterprise } from "@processor/views/Enterprise";
import "@processor/theme/base.css";

function ThemedSuiProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <SuiProvider colorScheme={theme}>{children}</SuiProvider>;
}

/** The portal's providers load account data as they mount, so a visitor without one gets none. */
function AccountProviders({ children }: { children: ReactNode }) {
  const { session, isAnonymous } = useAuth();
  return session && !isAnonymous ? (
    <PortalSettingsProviders>{children}</PortalSettingsProviders>
  ) : (
    children
  );
}

/**
 * The Enterprise page as its own route: none of the portal's chrome, but the same query cache,
 * sign-in and account link as billing, so a deal started on either side shows on the other.
 * EnterpriseAuthBoundary decides per build whether sign-in comes first.
 */
export function EnterpriseApp() {
  return (
    <QueryClientProvider client={getPortalQueryClient()}>
      <ThemeProvider>
        <ThemedSuiProvider>
          <div className="portal-scope">
            <EnterpriseAuthBoundary>
              <AccountProviders>
                <ErrorBoundary>
                  <Enterprise />
                </ErrorBoundary>
              </AccountProviders>
            </EnterpriseAuthBoundary>
          </div>
        </ThemedSuiProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
