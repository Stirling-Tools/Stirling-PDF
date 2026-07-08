import { TierProvider } from "@portal/contexts/TierContext";
import { LinkProvider, useLink } from "@portal/contexts/LinkContext";
import { UIProvider, useUI } from "@portal/contexts/UIContext";
import type { SupabaseLoginSession } from "@app/auth/ui/useSupabaseLogin";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";
import {
  AccountLinkProvider,
  useAccountLinkContext,
} from "@portal/contexts/AccountLinkContext";
import { PortalChrome } from "@portal/components/PortalChrome";

/**
 * The one and only account-link login modal. Mounted at the app root (never
 * nested in another overlay) and driven by UIContext, so any "Link account" CTA
 * — sidebar, billing prompt, feature gate, Settings panel — opens this exact
 * instance. Linking is finished by the shared {@link useAccountLinkContext}
 * orchestration.
 */
function LinkModalHost() {
  const { linkModalOpen, linkModalMode, closeLinkModal } = useUI();
  const { markSaasSessionChanged } = useLink();
  const link = useAccountLinkContext();
  // "reauth" only refreshes the browser SaaS session for attended reads — the
  // sign-in already applied it to the Supabase client, so we just signal a
  // refetch. It must NOT call completeLink (that re-registers → duplicate row).
  const onLinked =
    linkModalMode === "reauth"
      ? () => markSaasSessionChanged()
      : (session: SupabaseLoginSession) => link.completeLink(session);
  return (
    <LinkAccountModal
      open={linkModalOpen}
      mode={linkModalMode}
      onClose={closeLinkModal}
      onLinked={onLinked}
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
      <TierProvider initialTier="pro">
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
