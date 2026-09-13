import { useCallback } from "react";
import {
  useApplyLinkFacts,
  useLinkOptional,
} from "@processor/contexts/LinkContext";
import { useUI } from "@processor/contexts/UIContext";
import { useConnectGate } from "@processor/hooks/useConnectGate";
import { useProcessorAdmin } from "@processor/hooks/useProcessorAdmin";
import { FreeTierPlanView } from "@processor/components/billing/FreeTierPlanView";
import { Usage } from "@processor/views/Usage";
import type { Wallet } from "@processor/api/billing";

/**
 * The seam the SaaS build shadows: picks which usage page this instance has one of.
 *
 * <p>Two sources, never one: {@link onWalletLoaded} reports {@code linked} as a fact, and a
 * browser can hold a SaaS session with no link to this server, so routing the unlinked page through
 * the wallet would flip the whole processor to linked.
 */
export function ProcessorBillingGate() {
  const applyLinkFacts = useApplyLinkFacts();
  const { openLinkModal } = useUI();
  const { loading } = useConnectGate();
  const isAdmin = useProcessorAdmin();
  const link = useLinkOptional();

  const onWalletLoaded = useCallback(
    (w: Wallet) => applyLinkFacts(true, w.status === "subscribed"),
    [applyLinkFacts],
  );
  const onReauth = useCallback(() => openLinkModal("reauth"), [openLinkModal]);

  // Administrators only: the figures are instance-wide and the endpoints ADMIN-gated. The nav
  // hides the entry to match, so this is the backstop for a typed URL.
  if (!isAdmin) return null;
  // Neither page while the answer is unknown: showing the local meter to a linked instance would
  // present a dormant ledger as its live one.
  if (loading) return null;
  // A positively known link, not merely "not gated": linking turned off and a failed status
  // check are neither, and must not reach a SaaS this instance has no address for.
  if (!link?.isLinked) return <FreeTierPlanView />;
  return <Usage onWalletLoaded={onWalletLoaded} onReauth={onReauth} />;
}
