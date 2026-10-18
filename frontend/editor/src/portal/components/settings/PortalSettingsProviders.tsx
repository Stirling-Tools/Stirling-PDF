import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useFreeTierExhaustedPrompt } from "@app/portal/hooks/useFreeTierExhaustedPrompt";
import { LinkProvider } from "@app/portal/contexts/LinkContext";
import { TierProvider } from "@app/portal/contexts/TierContext";
import { UIProvider } from "@app/portal/contexts/UIContext";
import { AccountLinkProvider } from "@app/portal/contexts/AccountLinkContext";
import { AccountLinkSessionBoundary } from "@app/portal/components/account-link/AccountLinkSessionBoundary";
import { ConnectCallbackHost } from "@app/portal/components/account-link/ConnectCallbackHost";
import { AccountConnectionRefresh } from "@app/portal/components/account-link/AccountConnectionNotice";
import { LinkAccountModalHost } from "@app/portal/components/account-link/LinkAccountModal";

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
