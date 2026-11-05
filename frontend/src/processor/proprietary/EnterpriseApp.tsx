import { type ReactNode } from "react";
import { useAuth } from "@editor/auth";
import { EnterpriseAuthBoundary } from "@processor/auth/EnterpriseAuthBoundary";
import { PortalFrame } from "@processor/PortalFrame";
import { PortalSettingsProviders } from "@processor/components/settings/PortalSettingsProviders";
import { ErrorBoundary } from "@processor/components/ErrorBoundary";
import { Enterprise } from "@processor/views/Enterprise";

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
 * The Enterprise page as its own route, served like a website separate from the app: none of the
 * portal's chrome, but the same query cache, sign-in and account link as billing, so a deal started
 * on either side shows on the other. EnterpriseAuthBoundary decides per build whether sign-in
 * comes first.
 */
export function EnterpriseApp() {
  return (
    <PortalFrame>
      <EnterpriseAuthBoundary>
        <AccountProviders>
          <ErrorBoundary>
            <Enterprise />
          </ErrorBoundary>
        </AccountProviders>
      </EnterpriseAuthBoundary>
    </PortalFrame>
  );
}
