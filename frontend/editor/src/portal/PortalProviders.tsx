import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@portal/components/account-link/ConnectCallbackHost";
import { PortalChrome } from "@portal/components/PortalChrome";

/** The one and only account-link modal. */
function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal } = useUI();
  return (
    <LinkAccountModal
      open={linkModalOpen}
      mode={linkModalMode}
      onClose={closeLinkModal}
    />
  );
}

/** Self-hosted provider stack. */
export function PortalProviders() {
  return (
    <LinkProvider initialState="unlinked">
      <TierProvider>
        <UIProvider>
          <AccountLinkProvider>
            <PortalChrome />
            <LinkModalHost />
            <ConnectCallbackHost />
          </AccountLinkProvider>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
