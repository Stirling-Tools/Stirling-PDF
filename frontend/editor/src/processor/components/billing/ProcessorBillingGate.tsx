import { useCallback } from "react";
import { useApplyLinkFacts } from "@processor/contexts/LinkContext";
import { useUI } from "@processor/contexts/UIContext";
import { ConnectGuardedRoute } from "@processor/components/account-link/ConnectGuardedRoute";
import { VIEW_PATHS, toProcessorPath } from "@processor/contexts/ViewContext";
import { Usage } from "@processor/views/Usage";
import type { Wallet } from "@processor/api/billing";

/**
 * The seam the SaaS build shadows, and the backstop for a typed URL — the nav already refuses to
 * come here unlinked (the sidebar's requiresLink).
 *
 * <p>Usage must not render while unlinked: {@link onWalletLoaded} reports linked as a fact, and the
 * browser can hold a SaaS session with no link to this server, so rendering it flipped the processor
 * to linked.
 */
export function ProcessorBillingGate() {
  const applyLinkFacts = useApplyLinkFacts();
  const { openLinkModal } = useUI();

  const onWalletLoaded = useCallback(
    (w: Wallet) => applyLinkFacts(true, w.status === "subscribed"),
    [applyLinkFacts],
  );
  const onReauth = useCallback(() => openLinkModal("reauth"), [openLinkModal]);

  return (
    <ConnectGuardedRoute fallback={toProcessorPath(VIEW_PATHS.home)}>
      <Usage onWalletLoaded={onWalletLoaded} onReauth={onReauth} />
    </ConnectGuardedRoute>
  );
}
