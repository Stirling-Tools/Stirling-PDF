import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useFreeTierExhaustedPrompt } from "@portal/hooks/useFreeTierExhaustedPrompt";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { TierProvider } from "@portal/contexts/TierContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";

function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal, connectOutcome } =
    useUI();
  const { pathname } = useLocation();
  useFreeTierExhaustedPrompt(
    pathname === "/settings/billing" || pathname === "/settings/account-link",
  );
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
          <AccountLinkProvider>
            {children}
            <LinkModalHost />
          </AccountLinkProvider>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
