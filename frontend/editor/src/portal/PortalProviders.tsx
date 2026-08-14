import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider } from "@portal/contexts/LinkContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import { AccountLinkProvider } from "@portal/contexts/AccountLinkContext";
import { PortalChrome } from "@portal/components/PortalChrome";

/**
 * The one and only account-link modal. Mounted at the app root (never nested in
 * another overlay) and driven by UIContext, so any "Link account" CTA — sidebar,
 * billing prompt, feature gate, Settings panel — opens this exact instance.
 *
 * <p>It takes no completion callback: the modal only starts the handshake and
 * navigates to Stirling. The return leg lands on {@code /account-link/callback},
 * which deposits the session and tells the local backend to collect its
 * credential, so nothing finishes here.
 */
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

/**
 * Self-hosted provider stack. The account-link layer (LinkProvider +
 * AccountLinkProvider + the login modal) wraps the shared chrome; the tier is
 * derived from the link/subscription state (see usePlanTier). TierProvider sits
 * inside LinkProvider because the self-hosted usePlanTier reads useLink.
 *
 * The SaaS build shadows this file to drop the account-link layer entirely — the
 * signed-in account IS the SaaS account, so there is nothing to link and the
 * tier comes from the wallet.
 */
export function PortalProviders() {
  return (
    <LinkProvider initialState="unlinked">
      <TierProvider>
        <UIProvider>
          <AccountLinkProvider>
            <PortalChrome />
            <LinkModalHost />
          </AccountLinkProvider>
        </UIProvider>
      </TierProvider>
    </LinkProvider>
  );
}
