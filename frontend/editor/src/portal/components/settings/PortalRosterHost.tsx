import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { getPortalQueryClient } from "@portal/queryClient";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { TierProvider } from "@portal/contexts/TierContext";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import "@portal/theme/base.css";
import "@portal/components/settings/PortalSettingsSectionHost.css";

const PortalRosterLinkFlow = lazy(
  () => import("@portal/components/settings/PortalRosterLinkFlow"),
);

function RequestedLinkFlow() {
  const { linkModalOpen } = useUI();
  const location = useLocation();
  const hasCallback = Boolean(location.state?.accountLinkReturn);
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (linkModalOpen || hasCallback) setRequested(true);
  }, [linkModalOpen, hasCallback]);
  // The callback clears router state before its asynchronous claim finishes.
  return requested || linkModalOpen || hasCallback ? (
    <Suspense fallback={null}>
      <PortalRosterLinkFlow />
    </Suspense>
  ) : null;
}

/** The roster can renew cloud sign-in on demand; listing users must not mount
 *  instance-link endpoints, which are absent on SaaS and desktop cloud mode. */
export function PortalRosterHost({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getPortalQueryClient()}>
      <div className="portal-settings-section portal-scope">
        <LinkProvider initialState="unlinked">
          <TierProvider>
            <UIProvider>
              <ErrorBoundary>
                {children}
                <RequestedLinkFlow />
              </ErrorBoundary>
            </UIProvider>
          </TierProvider>
        </LinkProvider>
      </div>
    </QueryClientProvider>
  );
}
