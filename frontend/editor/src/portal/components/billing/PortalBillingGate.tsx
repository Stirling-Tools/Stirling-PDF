import { useCallback, useEffect } from "react";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useConnectGate } from "@portal/hooks/useConnectGate";
import { Usage } from "@portal/views/Usage";
import type { Wallet } from "@portal/api/billing";

/**
 * Billing access gate: the seam the SaaS build overrides.
 *
 * <p>Self-hosted (this base): billing only means anything once the instance has connected its
 * Stirling account, so arriving here unconnected asks for the connection. It asks with the dialog
 * rather than replacing the page with a prompt: a page whose only content is "you cannot see this
 * page" is a worse version of the dialog that would follow it anyway.
 *
 * <p>The Usage page still renders behind. Its own reads fail without a link and it already handles
 * that, so there is nothing to protect it from, and leaving it in place means dismissing the dialog
 * lands you somewhere real.
 *
 * <p>It also maps the page's callbacks onto the link dimension: the wallet's subscription status
 * refines the plan badge, and a lapsed SaaS session re-opens the re-auth. That keeps the "link"
 * concept entirely out of the Usage page. The SaaS build shadows this with a passthrough.
 */
export function PortalBillingGate() {
  const applyLinkFacts = useApplyLinkFacts();
  const { openLinkModal } = useUI();
  const { gated, connect } = useConnectGate();

  useEffect(() => {
    if (gated) connect();
  }, [gated, connect]);

  const onWalletLoaded = useCallback(
    (w: Wallet) => applyLinkFacts(true, w.status === "subscribed"),
    [applyLinkFacts],
  );
  const onReauth = useCallback(() => openLinkModal("reauth"), [openLinkModal]);

  return <Usage onWalletLoaded={onWalletLoaded} onReauth={onReauth} />;
}
