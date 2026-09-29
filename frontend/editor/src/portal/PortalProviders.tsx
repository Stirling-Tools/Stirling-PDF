import { TierProvider } from "@app/portal/contexts/TierContext";
import { LinkProvider } from "@app/portal/contexts/LinkContext";
import { UIProvider } from "@app/portal/contexts/UIContext";
import { LinkAccountModalHost } from "@app/portal/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@app/portal/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@app/portal/components/account-link/ConnectCallbackHost";
import { PortalChrome } from "@app/portal/components/PortalChrome";
import { AccountLinkSessionBoundary } from "@app/portal/components/account-link/AccountLinkSessionBoundary";
import { useFreeTierExhaustedPrompt } from "@app/portal/hooks/useFreeTierExhaustedPrompt";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { StartupPrompts } from "@app/components/startup/StartupPrompts";
import { ServerExperienceProvider } from "@app/contexts/ServerExperienceContext";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";

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
