import { useLocation } from "react-router-dom";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import { AppShell } from "@portal/components/AppShell";
import { PortalSettingsHost } from "@portal/components/PortalSettingsHost";
import { ViewRouter } from "@portal/ViewRouter";

/**
 * The routed view, wrapped in an error boundary so a single view crashing can't
 * white-screen the portal (the shell + nav stay alive). Keyed by route so
 * navigating to another section clears any error from the previous one.
 */
function RoutedContent() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <ViewRouter />
    </ErrorBoundary>
  );
}

/**
 * The flavor-agnostic portal chrome: the shell (sidebar + search bar + routed
 * view) plus the global overlays that every flavor shares. Requires only the
 * Tier and UI contexts above it — both flavors provide those. Flavor-specific
 * overlays (e.g. the self-hosted account-link modal) are mounted by
 * PortalProviders, not here.
 */
export function PortalChrome() {
  return (
    // One app-config instance for every portal consumer (search gates, the
    // settings modal) so they can't fetch twice or disagree.
    <AppConfigProvider bootstrapMode="non-blocking">
      {/* The pipeline builder reads the tool registry to list and configure operations. */}
      <ToolRegistryProvider>
        <AppShell>
          <RoutedContent />
        </AppShell>
      </ToolRegistryProvider>
      <PortalSettingsHost />
    </AppConfigProvider>
  );
}
