import type { ReactNode } from "react";
import { LinkProvider } from "@app/portal/contexts/LinkContext";
import { TierProvider } from "@app/portal/contexts/TierContext";
import { UIProvider, useUI } from "@app/portal/contexts/UIContext";
import { AccountLinkProvider } from "@app/portal/contexts/AccountLinkContext";
import { AccountLinkSessionBoundary } from "@app/portal/components/account-link/AccountLinkSessionBoundary";
import { ConnectCallbackHost } from "@app/portal/components/account-link/ConnectCallbackHost";
import { useAccountLinkOwner } from "@app/portal/hooks/useAccountLinkOwner";
import { LinkAccountModal } from "@app/portal/components/account-link/LinkAccountModal";

function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal, connectOutcome } =
    useUI();
  const isOwner = useAccountLinkOwner();
  if (!isOwner || !linkModalOpen) return null;
  return (
    <LinkAccountModal
      open
      mode={linkModalMode}
      onClose={closeLinkModal}
      outcome={connectOutcome}
    />
  );
}

/** The instance link starts unknown; checkout and license are inherited from AppProviders. */
export function PortalSettingsProviders({ children }: { children: ReactNode }) {
  return (
    <LinkProvider initialState="unlinked" statusKnown={false}>
      <TierProvider>
        <UIProvider>
          <AccountLinkSessionBoundary>
            <AccountLinkProvider>
              {children}
              <LinkModalHost />
              <ConnectCallbackHost />
            </AccountLinkProvider>
          </AccountLinkSessionBoundary>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
