import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ServerLicenseSection } from "@portal/components/billing/ServerLicenseSection";
import {
  useApplyLinkFacts,
  useLinkOptional,
} from "@portal/contexts/LinkContext";
import { useUI } from "@portal/contexts/UIContext";
import { useConnectGate } from "@portal/hooks/useConnectGate";
import { usePortalAdmin } from "@portal/hooks/usePortalAdmin";
import { FreeTierPlanView } from "@portal/components/billing/FreeTierPlanView";
import { Usage } from "@portal/views/Usage";
import type { Wallet } from "@portal/api/billing";

/**
 * The seam the SaaS build shadows: picks which usage page this instance has one of.
 *
 * <p>Two sources, never one: {@link onWalletLoaded} reports {@code linked} as a fact, and a
 * browser can hold a SaaS session with no link to this server, so routing the unlinked page through
 * the wallet would flip the whole portal to linked.
 */
export function PortalBillingGate() {
  const applyLinkFacts = useApplyLinkFacts();
  const { openLinkModal, trialSetupRequested } = useUI();
  const { loading, gated, connect } = useConnectGate();
  const isAdmin = usePortalAdmin();
  const link = useLinkOptional();
  const [searchParams] = useSearchParams();
  const prompted = useRef(false);
  const procurementRequested =
    trialSetupRequested || searchParams.get("procurement") === "start";

  useEffect(() => {
    if (!procurementRequested || link?.isLinked) prompted.current = false;
    else if (isAdmin && !loading && gated && !prompted.current) {
      prompted.current = true;
      connect();
    }
  }, [procurementRequested, link?.isLinked, isAdmin, loading, gated, connect]);

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
  if (!link?.isLinked)
    return (
      <FreeTierPlanView
        licenseSection={<ServerLicenseSection onSaved={() => {}} />}
      />
    );
  return (
    <Usage
      onWalletLoaded={onWalletLoaded}
      onReauth={onReauth}
      renderLicenseSection={(onSaved) => (
        <ServerLicenseSection onSaved={onSaved} />
      )}
    />
  );
}
