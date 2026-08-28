import { useCallback } from "react";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { ConnectGuardedRoute } from "@portal/components/account-link/ConnectGuardedRoute";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { Usage } from "@portal/views/Usage";
import type { Wallet } from "@portal/api/billing";

/**
 * Billing access gate: the seam the SaaS build overrides.
 *
 * <p>Self-hosted (this base): billing only means anything once the instance has connected its
 * Stirling account, so arriving here unconnected asks for the connection and goes back where it
 * came from. The nav does not send anyone here in that state (see the sidebar's requiresLink), so
 * this is the backstop for a typed URL or an old bookmark.
 *
 * <p>The Usage page must not render while unconnected, for two reasons. It is a page about an
 * account this instance does not have, so dismissing the dialog would strand the admin on it; and
 * {@link onWalletLoaded} reports {@code linked} as a fact, so a wallet read that happens to succeed
 * (the browser can hold a SaaS session with no link between it and this server) would flip the
 * whole portal to linked.
 *
 * <p>Mapping the page's callbacks here is what keeps the "link" concept out of the Usage page.
 */
export function PortalBillingGate() {
  const applyLinkFacts = useApplyLinkFacts();
  const { openLinkModal } = useUI();

  const onWalletLoaded = useCallback(
    (w: Wallet) => applyLinkFacts(true, w.status === "subscribed"),
    [applyLinkFacts],
  );
  const onReauth = useCallback(() => openLinkModal("reauth"), [openLinkModal]);

  return (
    <ConnectGuardedRoute fallback={toPortalPath(VIEW_PATHS.home)}>
      <Usage onWalletLoaded={onWalletLoaded} onReauth={onReauth} />
    </ConnectGuardedRoute>
  );
}
