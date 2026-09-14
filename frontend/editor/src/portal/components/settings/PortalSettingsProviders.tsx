import type { ReactNode } from "react";
import { LinkProvider } from "@app/portal/contexts/LinkContext";
import { TierProvider } from "@app/portal/contexts/TierContext";
import { UIProvider, useUI } from "@app/portal/contexts/UIContext";
import { SettingsAccountLinkSession } from "@app/portal/components/account-link/SettingsAccountLinkSession";
import { LinkAccountModal } from "@app/portal/components/account-link/LinkAccountModal";

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
export function PortalSettingsProviders({ children }: { children: ReactNode }) {
  return (
    <LinkProvider initialState="unlinked" statusKnown={false}>
      <TierProvider>
        <UIProvider>
          <SettingsAccountLinkSession>
            {children}
            <LinkModalHost />
          </SettingsAccountLinkSession>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
