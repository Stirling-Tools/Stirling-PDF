import { useEffect } from "react";
import { Skeleton } from "@app/ui";
import { useUI } from "@processor/contexts/UIContext";
import { EditorStatusCard } from "@processor/components/EditorStatusCard";
import { ConnectAccountRail } from "@processor/components/ConnectAccountRail";
import { ControlledDealStatusHero } from "@processor/components/procurement/ProcurementBanner";
import { ProcurementFlow } from "@processor/components/procurement/ProcurementFlow";
import { useProcurement } from "@processor/components/procurement/useProcurement";

/**
 * The Home hero: always the Editor deployment rail, carrying the deal-status hero as its footer
 * while a procurement deal is underway (procurement is a bolt-on to any tier). The rail states its
 * own deployment status and deploy ask, so there is nothing for a tier to choose between. The
 * procurement takeover modals render alongside.
 */
export function HomeHero() {
  const procurement = useProcurement();
  const { trialSetupRequested, clearTrialSetupRequest } = useUI();
  const dealActive =
    procurement.isLinked && procurement.started && !!procurement.data;

  // Someone said yes to enterprise elsewhere (the billing upsell, a sales link). Open trial setup
  // once the snapshot has landed, so a buyer who already has a deal is not asked to start another.
  useEffect(() => {
    if (!trialSetupRequested || procurement.loading) return;
    clearTrialSetupRequest();
    if (!procurement.started) procurement.onExploreEnterprise();
  }, [trialSetupRequested, procurement, clearTrialSetupRequest]);

  return (
    <>
      <ConnectAccountRail />
      {procurement.loading ? (
        // Hold the rail's shape rather than committing to a footer: branching before the snapshot
        // lands paints the no-deal rail first, flashing on every refresh of an active deal.
        <section className="processor-surface processor-editor-hero" aria-busy>
          <div className="processor-editor-hero__row">
            <Skeleton width="2rem" height="2rem" />
            <Skeleton width="12rem" height="1rem" />
          </div>
        </section>
      ) : (
        <EditorStatusCard
          footer={
            dealActive ? (
              <ControlledDealStatusHero controller={procurement} />
            ) : undefined
          }
        />
      )}
      <ProcurementFlow controller={procurement} />
    </>
  );
}
