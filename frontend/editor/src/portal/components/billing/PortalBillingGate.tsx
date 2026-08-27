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
 * <p>The Usage page must not render while unconnected, which it used to. Two things went wrong.
 * It is a page about an account this instance does not have, so dismissing the dialog stranded the
 * admin on it; and {@link onWalletLoaded} reports {@code linked} as a fact, so a wallet read that
 * happened to succeed — the browser can hold a SaaS session with no link between it and this
 * server — flipped the whole portal to linked.
 *
 * <p>It also maps the page's callbacks onto the link dimension: the wallet's subscription status
 * refines the plan badge, and a lapsed SaaS session re-opens the re-auth. That keeps the "link"
 * concept entirely out of the Usage page. The SaaS build shadows this with a passthrough.
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
