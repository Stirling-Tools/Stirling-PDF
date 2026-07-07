import type { Tier } from "@portal/contexts/TierContext";
import { WelcomeBanner } from "@portal/components/WelcomeBanner";
import { EditorStatusCard } from "@portal/components/EditorStatusCard";
import { SetupChecklist } from "@portal/components/SetupChecklist";
import { ControlledDealStatusHero } from "@portal/components/procurement/ProcurementBanner";
import { ProcurementFlow } from "@portal/components/procurement/ProcurementFlow";
import { useProcurement } from "@portal/components/procurement/useProcurement";

/**
 * The Home hero, composed per tier with a procurement-aware footer:
 *
 *  - free       → marketing welcome banner
 *  - subscribed → deployed-Editor status card
 *  - enterprise → deployed-Editor status card (chips hidden; the deal hero owns invite)
 *
 * The footer is the deal-status hero while a procurement deal is underway
 * (procurement is a bolt-on to any tier), otherwise the setup checklist. The
 * procurement takeover flow modals render alongside so the hero's actions can
 * open them.
 */
export function HomeHero({
  tier,
  onTryOp,
}: {
  tier: Tier;
  onTryOp: () => void;
}) {
  const procurement = useProcurement();
  const dealActive =
    procurement.isLinked && procurement.started && !!procurement.data;

  const footer = dealActive ? (
    <ControlledDealStatusHero controller={procurement} />
  ) : (
    <SetupChecklist onTryOp={onTryOp} />
  );

  return (
    <>
      {tier === "free" ? (
        <WelcomeBanner footer={footer} />
      ) : (
        <EditorStatusCard footer={footer} hideChips={tier === "enterprise"} />
      )}
      <ProcurementFlow controller={procurement} />
    </>
  );
}
