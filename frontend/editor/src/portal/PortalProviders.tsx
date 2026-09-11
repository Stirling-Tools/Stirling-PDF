import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@portal/components/account-link/ConnectCallbackHost";
import { PortalChrome } from "@portal/components/PortalChrome";
import { useConnectPrompt } from "@portal/hooks/useConnectPrompt";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";

/** The one and only account-link modal, whichever step it is on. */
function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal, connectOutcome } =
    useUI();
  // Ask once a session while the instance is unlinked, rather than waiting to be found.
  useConnectPrompt();

  // Mounted only while open: kept mounted, an interrupted hand-off stays flagged and every
  // later open resumes on a ghost step with no way forward.
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

/**
 * Self-hosted provider stack. Checkout is mounted here rather than inherited: the portal is its
 * own route-set, outside the {@code AppProviders} where the editor keeps its copy.
 * {@code LicenseProvider} comes with it, since the checkout reads the licence to know what it
 * is selling.
 */
export function PortalProviders() {
  return (
    <LinkProvider initialState="unlinked" statusKnown={false}>
      <TierProvider>
        <UIProvider>
          <AccountLinkProvider>
            <LicenseProvider>
              <CheckoutProvider>
                <PortalChrome />
                <LinkModalHost />
                <ConnectCallbackHost />
              </CheckoutProvider>
            </LicenseProvider>
          </AccountLinkProvider>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
