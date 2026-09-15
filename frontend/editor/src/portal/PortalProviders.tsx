import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { ConnectCallbackHost } from "@portal/components/account-link/ConnectCallbackHost";
import { PortalChrome } from "@portal/components/PortalChrome";
import { useFreeTierExhaustedPrompt } from "@portal/hooks/useFreeTierExhaustedPrompt";
import { LicenseProvider } from "@app/contexts/LicenseContext";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { CheckoutProvider } from "@app/contexts/CheckoutContext";

/** The one and only account-link modal, whichever step it is on. */
function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal, connectOutcome } =
    useUI();
  // Being unlinked prompts nothing: the free tier is the whole product. The only unprompted ask is
  // the server reporting the month's grant spent.
  useFreeTierExhaustedPrompt();

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
 * License and checkout both need the local app config; without its provider, license loading
 * waits indefinitely for the admin and login settings.
 */
export function PortalProviders() {
  return (
    <LinkProvider initialState="unlinked" statusKnown={false}>
      <TierProvider>
        <UIProvider>
          <AccountLinkProvider>
            <AppConfigProvider>
              <LicenseProvider>
                <CheckoutProvider>
                  <PortalChrome />
                  <LinkModalHost />
                  <ConnectCallbackHost />
                </CheckoutProvider>
              </LicenseProvider>
            </AppConfigProvider>
          </AccountLinkProvider>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
