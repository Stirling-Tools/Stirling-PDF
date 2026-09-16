import { useServerPlan } from "@app/portal/hooks/useServerPlan";
import { ManageBillingButton } from "@app/components/shared/ManageBillingButton";
import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ServerLicenseSection } from "@app/portal/components/billing/ServerLicenseSection";
import {
  useApplyLinkFacts,
  useLinkOptional,
} from "@app/portal/contexts/LinkContext";
import { useUI } from "@app/portal/contexts/UIContext";
import { useConnectGate } from "@app/portal/hooks/useConnectGate";
import { useAccountLinkOwner } from "@app/portal/hooks/useAccountLinkOwner";
import { SaasSessionBanner } from "@app/portal/components/account-link/SaasSessionBanner";
import { FreeTierPlanView } from "@app/portal/components/billing/FreeTierPlanView";
import { Usage } from "@app/portal/views/Usage";
import type { Wallet } from "@app/portal/api/billing";

/**
 * The seam the SaaS build shadows: picks which usage page this instance has one of.
 *
 * <p>Two sources, never one: {@link onWalletLoaded} reports {@code linked} as a fact, and a
 * browser can hold a SaaS session with no link to this server, so routing the unlinked page through
 * the wallet would flip the whole portal to linked.
 */
export function PortalBillingGate() {
  const applyLinkFacts = useApplyLinkFacts();
  const { trialSetupRequested } = useUI();
  const { loading, gated, connect } = useConnectGate();
  const isOwner = useAccountLinkOwner();
  const { serverPlan, loading: licenseLoading } = useServerPlan(isOwner);
  const serverPlanAction = serverPlan ? <ManageBillingButton /> : undefined;
  const link = useLinkOptional();
  const [searchParams] = useSearchParams();
  const prompted = useRef(false);
  const procurementRequested =
    trialSetupRequested || searchParams.get("procurement") === "start";

  useEffect(() => {
    if (!procurementRequested || link?.isLinked) prompted.current = false;
    else if (isOwner && !loading && gated && !prompted.current) {
      prompted.current = true;
      connect();
    }
  }, [procurementRequested, link?.isLinked, isOwner, loading, gated, connect]);

  const onWalletLoaded = useCallback(
    (w: Wallet) => applyLinkFacts(true, w.status === "subscribed"),
    [applyLinkFacts],
  );

  // Only the organization owner manages the server's account and billing.
  // The nav hides these sections too; this guards a directly entered URL.
  if (!isOwner) return null;
  // Neither page while the answer is unknown: showing the local meter to a linked instance would
  // present a dormant ledger as its live one.
  if (loading || licenseLoading) return null;
  // A positively known link, not merely "not gated": linking turned off and a failed status
  // check are neither, and must not reach a SaaS this instance has no address for.
  if (!link?.isLinked)
    return (
      <FreeTierPlanView
        serverPlan={serverPlan}
        serverPlanAction={serverPlanAction}
        licenseSection={<ServerLicenseSection onSaved={() => {}} />}
      />
    );
  return (
    <Usage
      serverPlan={serverPlan}
      serverPlanAction={serverPlanAction}
      onWalletLoaded={onWalletLoaded}
      renderLicenseSection={(onSaved) => (
        <ServerLicenseSection onSaved={onSaved} />
      )}
      sessionRecovery={<SaasSessionBanner />}
    />
  );
}
