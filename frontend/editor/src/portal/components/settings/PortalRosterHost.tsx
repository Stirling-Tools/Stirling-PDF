import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getPortalQueryClient } from "@portal/queryClient";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { TierProvider } from "@portal/contexts/TierContext";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import "@portal/theme/base.css";
import "@portal/components/settings/PortalSettingsSectionHost.css";

/** Runs the roster in settings with only the contexts it reads. Deliberately not
 *  PortalSettingsSectionHost: desktop has no account-link flow to mount. */
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
