import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { getPortalQueryClient } from "@processor/queryClient";
import { LinkProvider } from "@processor/contexts/LinkContext";
import { TierProvider } from "@processor/contexts/TierContext";
import { ErrorBoundary } from "@processor/components/ErrorBoundary";
import { UIProvider, useUI } from "@processor/contexts/UIContext";
import "@processor/theme/base.css";
import "@processor/components/settings/PortalSettingsSectionHost.css";

const PortalRosterLinkFlow = lazy(
  () => import("@processor/components/settings/PortalRosterLinkFlow"),
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
