import { TierProvider } from "@processor/contexts/TierContext";
import { LinkProvider } from "@processor/contexts/LinkContext";
import { UIProvider, useUI } from "@processor/contexts/UIContext";
import { LinkAccountModal } from "@processor/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@processor/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@processor/components/account-link/ConnectCallbackHost";
import { ProcessorChrome } from "@processor/components/ProcessorChrome";
import { useFreeTierExhaustedPrompt } from "@processor/hooks/useFreeTierExhaustedPrompt";

/** The one and only account-link modal, whichever step it is on. */
function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal, connectOutcome } =
    useUI();
  // Being unlinked prompts nothing: the free tier is the whole product. The only unprompted ask is
  // the server reporting the month's grant spent.
  useFreeTierExhaustedPrompt();

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
    <LinkProvider initialState="unlinked" statusKnown={false}>
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
