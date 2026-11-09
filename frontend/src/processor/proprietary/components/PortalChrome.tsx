import { AccountConnectionRefresh } from "@editor/portal/components/account-link/AccountConnectionNotice";
import { useLocation } from "react-router-dom";
import { ErrorBoundary } from "@editor/portal/components/ErrorBoundary";
import { AppShell } from "@editor/portal/components/AppShell";
import { ViewRouter } from "@editor/portal/ViewRouter";

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
 * view) plus the global overlays that every flavor shares. Requires the Tier
 * and UI contexts above it, which both flavors provide, and reads the app
 * config and tool registry from PlatformProviders. Flavor-specific overlays
 * (e.g. the self-hosted account-link modal) are mounted by PortalProviders.
 */
export function PortalChrome() {
  return (
    <>
      <AccountConnectionRefresh />
      <AppShell>
        <RoutedContent />
      </AppShell>
    </>
  );
}
