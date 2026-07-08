import { useCallback } from "react";
import { useApplyLinkFacts, useLink } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { LinkAccountPrompt } from "@portal/components/billing/LinkAccountPrompt";
import { Usage } from "@portal/views/Usage";
import type { Wallet } from "@portal/api/billing";

/**
 * Billing access gate — the seam the SaaS build overrides.
 *
 * <p>Self-hosted (this base): billing only makes sense once the instance has
 * linked its SaaS account, so gate on link state — unlinked shows the link prompt;
 * linked renders the (flavor-agnostic) Usage page and maps its callbacks onto the
 * link/tier dimension: the wallet's subscription status refines the plan/tier
 * badge, and a lapsed SaaS session re-opens the account-link re-auth. This keeps
 * the "link" concept entirely out of the Usage page. The SaaS build shadows this
 * with a passthrough — there is no linking there.
 */
export function PortalBillingGate() {
  const { isLinked } = useLink();
  const applyLinkFacts = useApplyLinkFacts();
  const { openLinkModal } = useUI();

  const onWalletLoaded = useCallback(
    (w: Wallet) => applyLinkFacts(true, w.status === "subscribed"),
    [applyLinkFacts],
  );
  const onReauth = useCallback(() => openLinkModal("reauth"), [openLinkModal]);

  if (!isLinked) return <LinkAccountPrompt />;
  return <Usage onWalletLoaded={onWalletLoaded} onReauth={onReauth} />;
}
