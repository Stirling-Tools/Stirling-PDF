import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ProcessorAuthBoundary } from "@processor/auth/ProcessorAuthBoundary";
import { ThemeProvider, useTheme } from "@processor/contexts/ThemeContext";
import { SuiProvider } from "@processor/theme/SuiProvider";
import { ProcessorProviders } from "@processor/ProcessorProviders";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { getProcessorQueryClient } from "@processor/queryClient";
// Reset + typography, scoped to .processor-scope below.
import "@processor/theme/base.css";

/**
 * Binds the SUI design system to the processor's own ThemeProvider so the SUI
 * components follow the same light/dark switch as the CSS tokens. Must sit
 * inside <ThemeProvider> to read useTheme().
 */
function ThemedSuiProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <SuiProvider colorScheme={theme}>{children}</SuiProvider>;
}

/**
 * The processor, mounted as a route-set under /processor/* inside the editor app
 * (via the admin-route seam). It supplies its own providers and its own i18next
 * instance (the `processor` namespace), but NOT a router — the editor's
 * <BrowserRouter> is the one and only router; the processor's routes are relative
 * to the /processor mount (see ViewRouter).
 *
 * The provider stack itself is a per-flavor seam (see {@link ProcessorProviders}):
 * self-hosted mounts the account-link layer, SaaS does not.
 */
export function ProcessorApp() {
  const queryClient = getProcessorQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedSuiProvider>
          {/* Scopes base.css to the processor so it doesn't restyle the host editor. */}
          <div className="processor-scope">
            {/* Tool registry is read by processor views (e.g. the policy setup
                wizard); mount it above the per-flavor provider split. */}
            <ToolRegistryProvider>
              <ProcessorAuthBoundary>
                <ProcessorProviders />
              </ProcessorAuthBoundary>
            </ToolRegistryProvider>
          </div>
        </ThemedSuiProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
