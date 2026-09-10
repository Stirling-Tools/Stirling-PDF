import { useCallback } from "react";
import { useApplyLinkFacts } from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useConnectGate } from "@portal/hooks/useConnectGate";
import { usePortalAdmin } from "@portal/hooks/usePortalAdmin";
import { FreeTierPlanView } from "@portal/components/billing/FreeTierPlanView";
import { Usage } from "@portal/views/Usage";
import type { Wallet } from "@portal/api/billing";

/**
 * The seam the SaaS build shadows: picks which usage page this instance has one of.
 *
 * <p>Two sources, never one. Unlinked reads the instance's own free-grant meter and asserts nothing
 * about linkage; linked reads the cloud wallet. Keeping them apart is what keeps {@link
 * onWalletLoaded} honest — it reports {@code linked} as a fact, and the browser can hold a SaaS
 * session with no link to this server, so routing the unlinked page through the wallet flipped the
 * whole portal to linked.
 */
export function PortalBillingGate() {
  const applyLinkFacts = useApplyLinkFacts();
  const { openLinkModal } = useUI();
  const { gated, loading } = useConnectGate();
  const isAdmin = usePortalAdmin();

  const onWalletLoaded = useCallback(
    (w: Wallet) => applyLinkFacts(true, w.status === "subscribed"),
    [applyLinkFacts],
  );
  const onReauth = useCallback(() => openLinkModal("reauth"), [openLinkModal]);

  // Administrators only for now. Both pages report figures for the whole instance, and the
  // endpoints behind them are ADMIN-gated, so a member would get a page explaining itself away.
  // The nav hides the entry to match; this is the backstop for a typed URL.
  if (!isAdmin) return null;
  // Neither page while the answer is unknown: showing the local meter to a linked instance would
  // present a dormant ledger as its live one.
  if (loading) return null;
  if (gated) return <FreeTierPlanView />;
  return <Usage onWalletLoaded={onWalletLoaded} onReauth={onReauth} />;
}
