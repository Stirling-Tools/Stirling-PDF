import type { ReactNode } from "react";
import { LinkProvider } from "@processor/contexts/LinkContext";
import { TierProvider } from "@processor/contexts/TierContext";
import { UIProvider, useUI } from "@processor/contexts/UIContext";
import { AccountLinkProvider } from "@processor/contexts/AccountLinkContext";
import { LinkAccountModal } from "@processor/components/account-link/LinkAccountModal";

function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal, connectOutcome } =
    useUI();
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

/** The instance link starts unknown; checkout and license are inherited from AppProviders. */
export function ProcessorSettingsProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LinkProvider initialState="unlinked" statusKnown={false}>
      <TierProvider>
        <UIProvider>
          <AccountLinkProvider>
            {children}
            <LinkModalHost />
          </AccountLinkProvider>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
