import { TierProvider } from "@editor/portal/contexts/TierContext";
import { LinkProvider } from "@editor/portal/contexts/LinkContext";
import { UIProvider } from "@editor/portal/contexts/UIContext";
import { LinkAccountModalHost } from "@editor/portal/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@editor/portal/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@editor/portal/components/account-link/ConnectCallbackHost";
import { PortalChrome } from "@editor/portal/components/PortalChrome";
import { AccountLinkSessionBoundary } from "@editor/portal/components/account-link/AccountLinkSessionBoundary";
import { useFreeTierExhaustedPrompt } from "@editor/portal/hooks/useFreeTierExhaustedPrompt";
import { StartupPrompts } from "@editor/components/startup/StartupPrompts";
import { CheckoutProvider } from "@editor/contexts/CheckoutContext";

function LinkModalHost() {
  useFreeTierExhaustedPrompt();
  return <LinkAccountModalHost />;
}

/**
 * Self-hosted provider stack. Checkout is mounted here rather than inherited: its modal renders
 * inside whichever app opened it, so each app mounts its own under its own theme.
 */
export function PortalProviders() {
  return (
    <LinkProvider initialState="unlinked" statusKnown={false}>
      <TierProvider>
        <AccountLinkSessionBoundary>
          <UIProvider>
            <AccountLinkProvider>
              <CheckoutProvider>
                <StartupPrompts />
                <PortalChrome />
                <LinkModalHost />
                <ConnectCallbackHost />
              </CheckoutProvider>
            </AccountLinkProvider>
          </UIProvider>
        </AccountLinkSessionBoundary>
      </TierProvider>
    </LinkProvider>
  );
}
