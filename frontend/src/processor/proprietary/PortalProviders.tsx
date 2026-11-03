import { TierProvider } from "@editor/portal/contexts/TierContext";
import { LinkProvider } from "@editor/portal/contexts/LinkContext";
import { UIProvider } from "@editor/portal/contexts/UIContext";
import { LinkAccountModalHost } from "@editor/portal/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@editor/portal/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@editor/portal/components/account-link/ConnectCallbackHost";
import { PortalChrome } from "@editor/portal/components/PortalChrome";
import { AccountLinkSessionBoundary } from "@editor/portal/components/account-link/AccountLinkSessionBoundary";
import { useFreeTierExhaustedPrompt } from "@editor/portal/hooks/useFreeTierExhaustedPrompt";
import { LicenseProvider } from "@editor/contexts/LicenseContext";
import { AppConfigProvider } from "@editor/contexts/AppConfigContext";
import { StartupPrompts } from "@editor/components/startup/StartupPrompts";
import { ServerExperienceProvider } from "@editor/contexts/ServerExperienceContext";
import { CheckoutProvider } from "@editor/contexts/CheckoutContext";

function LinkModalHost() {
  useFreeTierExhaustedPrompt();
  return <LinkAccountModalHost />;
}

/**
 * Self-hosted provider stack. Checkout is mounted here rather than inherited: the portal is its
 * own route-set, outside the {@code AppProviders} where the editor keeps its copy.
 * License and checkout both need the local app config; without its provider, license loading
 * waits indefinitely for the admin and login settings.
 */
export function PortalProviders() {
  return (
    <LinkProvider initialState="unlinked" statusKnown={false}>
      <TierProvider>
        <AccountLinkSessionBoundary>
          <UIProvider>
            <AccountLinkProvider>
              <AppConfigProvider>
                <LicenseProvider>
                  <CheckoutProvider>
                    <ServerExperienceProvider>
                      <StartupPrompts />
                      <PortalChrome />
                    </ServerExperienceProvider>
                    <LinkModalHost />
                    <ConnectCallbackHost />
                  </CheckoutProvider>
                </LicenseProvider>
              </AppConfigProvider>
            </AccountLinkProvider>
          </UIProvider>
        </AccountLinkSessionBoundary>
      </TierProvider>
    </LinkProvider>
  );
}
