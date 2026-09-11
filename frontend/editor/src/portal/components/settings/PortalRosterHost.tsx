import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getPortalQueryClient } from "@portal/queryClient";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { TierProvider } from "@portal/contexts/TierContext";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import "@portal/theme/base.css";
import "@portal/components/settings/PortalSettingsSectionHost.css";

/**
 * Runs the roster inside the settings page, with the contexts it actually reads
 * and nothing else: the portal's shared query client, the tier (which reads the
 * link state, so LinkProvider comes with it), and its scoped CSS reset.
 *
 * <p>Deliberately not {@link PortalSettingsSectionHost}. That one also mounts
 * the account-link provider and its dialog, which is the flow for linking a
 * self-hosted instance to a Stirling account — a concept the desktop build,
 * which now reaches the roster, does not have. Keep the two apart: the roster is
 * the one portal view a build without the processor is served.
 */
export function PortalRosterHost({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getPortalQueryClient()}>
      <div className="portal-settings-section portal-scope">
        <LinkProvider initialState="unlinked">
          <TierProvider>
            <ErrorBoundary>{children}</ErrorBoundary>
          </TierProvider>
        </LinkProvider>
      </div>
    </QueryClientProvider>
  );
}
