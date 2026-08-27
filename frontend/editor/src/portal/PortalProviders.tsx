import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@portal/components/account-link/ConnectCallbackHost";
import { PortalChrome } from "@portal/components/PortalChrome";
import { useConnectPrompt } from "@portal/hooks/useConnectPrompt";

/** The one and only account-link modal, whichever step it is on. */
function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal, connectOutcome } =
    useUI();
  // Ask once a session while the instance is unlinked, rather than waiting to be found.
  useConnectPrompt();

  // Mounted only while open, so closing discards the flow's state instead of parking it. The
  // dialog's step is derived from an in-flight hand-off, and a hand-off that was interrupted (the
  // admin closed the dialog on the way out, or came back from Stirling) stays flagged: kept
  // mounted, every later open would reopen on the ghost step with no way forward. Modal already
  // renders null when closed, so there is no exit transition to lose.
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
