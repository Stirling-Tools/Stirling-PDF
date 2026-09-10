import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@portal/components/account-link/ConnectCallbackHost";
import { PortalChrome } from "@portal/components/PortalChrome";
import { useConnectPrompt } from "@portal/hooks/useConnectPrompt";
import { AccountLinkSessionBoundary } from "@portal/components/account-link/AccountLinkSessionBoundary";
import { SaasSessionBanner } from "@portal/components/account-link/SaasSessionBanner";

/** The one and only account-link modal, whichever step it is on. */
function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal, connectOutcome } =
    useUI();
  // Ask once a session while the instance is unlinked, rather than waiting to be found.
  useConnectPrompt();

  // Mounted only while open, so closing discards the flow. Kept mounted, an interrupted hand-off
  // stays flagged and every later open resumes on the ghost step with no way forward.
  if (!linkModalOpen) return null;
  return (
    <LinkAccountModal
      open
      mode={linkModalMode}
      onClose={closeLinkModal}
      outcome={connectOutcome}
    />
  );
}

/** Self-hosted provider stack. */
export function PortalProviders() {
  return (
    <LinkProvider initialState="unlinked" statusKnown={false}>
      <TierProvider>
        <AccountLinkSessionBoundary>
          <UIProvider>
            <AccountLinkProvider>
              <PortalChrome banner={<SaasSessionBanner />} />
              <LinkModalHost />
              <ConnectCallbackHost />
            </AccountLinkProvider>
          </UIProvider>
        </AccountLinkSessionBoundary>
      </TierProvider>
    </LinkProvider>
  );
}
