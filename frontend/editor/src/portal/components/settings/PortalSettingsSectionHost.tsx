import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getPortalQueryClient } from "@portal/queryClient";
import { PortalSettingsProviders } from "@portal/components/settings/PortalSettingsProviders";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import "@portal/theme/base.css";
import "@portal/components/settings/PortalSettingsSectionHost.css";

/**
 * Runs a portal-authored view inside the settings page. Those views are written
 * against the portal's own data and UI contexts and its scoped CSS reset, none
 * of which the editor tree provides — this host supplies exactly that much of
 * the portal, and nothing of its chrome. The query client is the portal's
 * shared singleton, so a view opened here and the same view opened in the
 * processor read one cache.
 */
export function PortalSettingsSectionHost({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={getPortalQueryClient()}>
      <div className="portal-settings-section portal-scope">
        <PortalSettingsProviders>
          <ErrorBoundary>{children}</ErrorBoundary>
        </PortalSettingsProviders>
      </div>
    </QueryClientProvider>
  );
}
