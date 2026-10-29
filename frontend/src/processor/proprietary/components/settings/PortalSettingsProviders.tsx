import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useFreeTierExhaustedPrompt } from "@editor/portal/hooks/useFreeTierExhaustedPrompt";
import { LinkProvider } from "@editor/portal/contexts/LinkContext";
import { TierProvider } from "@editor/portal/contexts/TierContext";
import { UIProvider } from "@editor/portal/contexts/UIContext";
import { AccountLinkProvider } from "@editor/portal/contexts/AccountLinkContext";
import { AccountLinkSessionBoundary } from "@editor/portal/components/account-link/AccountLinkSessionBoundary";
import { ConnectCallbackHost } from "@editor/portal/components/account-link/ConnectCallbackHost";
import { AccountConnectionRefresh } from "@editor/portal/components/account-link/AccountConnectionNotice";
import { LinkAccountModalHost } from "@editor/portal/components/account-link/LinkAccountModal";

function SettingsLinkModalHost() {
  const { pathname } = useLocation();
  useFreeTierExhaustedPrompt(
    pathname === "/settings/billing" || pathname === "/settings/account-link",
  );
  return <LinkAccountModalHost />;
}

/** The instance link starts unknown; checkout and license are inherited from AppProviders. */
export function PortalSettingsProviders({ children }: { children: ReactNode }) {
  return (
    <LinkProvider initialState="unlinked" statusKnown={false}>
      <TierProvider>
        <UIProvider>
          <AccountLinkSessionBoundary>
            <AccountLinkProvider>
              <AccountConnectionRefresh />
              {children}
              <SettingsLinkModalHost />
              <ConnectCallbackHost />
            </AccountLinkProvider>
          </AccountLinkSessionBoundary>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
