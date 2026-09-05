import { useCallback } from "react";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { ConnectGuardedRoute } from "@portal/components/account-link/ConnectGuardedRoute";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { Usage } from "@portal/views/Usage";
import type { Wallet } from "@portal/api/billing";

/**
 * The seam the SaaS build shadows, and the backstop for a typed URL — the nav already refuses to
 * come here unlinked (the sidebar's requiresLink).
 *
 * <p>Usage must not render while unlinked: {@link onWalletLoaded} reports linked as a fact, and the
 * browser can hold a SaaS session with no link to this server, so rendering it flipped the portal
 * to linked.
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
