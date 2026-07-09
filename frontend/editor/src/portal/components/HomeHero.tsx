import type { Tier } from "@portal/contexts/TierContext";
import { useUI } from "@portal/contexts/UIContext";
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
export function HomeHero({ tier }: { tier: Tier }) {
  const { openLinkModal } = useUI();
  const procurement = useProcurement();
  const dealActive =
    procurement.isLinked && procurement.started && !!procurement.data;

  // Start the enterprise flow right here on Home: open the trial-setup modal when the account is
  // linked, otherwise prompt to link first — no navigating off to the procurement view.
  const onStartEnterprise = () => {
    if (procurement.isLinked) procurement.onStartTrial();
    else openLinkModal();
  };

  const footer = dealActive ? (
    <ControlledDealStatusHero controller={procurement} />
  ) : (
    <SetupChecklist onStartEnterprise={onStartEnterprise} />
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
