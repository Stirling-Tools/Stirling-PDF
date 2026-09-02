import { TierProvider } from "@processor/contexts/TierContext";
import { LinkProvider } from "@processor/contexts/LinkContext";
import { UIProvider, useUI } from "@processor/contexts/UIContext";
import { LinkAccountModal } from "@processor/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@processor/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@processor/components/account-link/ConnectCallbackHost";
import { ProcessorChrome } from "@processor/components/ProcessorChrome";
import { useConnectPrompt } from "@processor/hooks/useConnectPrompt";

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
export function ProcessorProviders() {
  return (
    <LinkProvider initialState="unlinked">
      <TierProvider>
        <UIProvider>
          <AccountLinkProvider>
            <ProcessorChrome />
            <LinkModalHost />
            <ConnectCallbackHost />
          </AccountLinkProvider>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
