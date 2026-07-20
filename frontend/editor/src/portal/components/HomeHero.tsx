import type { Tier } from "@portal/contexts/TierContext";
import { useUI } from "@portal/contexts/UIContext";
import { WelcomeBanner } from "@portal/components/WelcomeBanner";
import { EditorStatusCard } from "@portal/components/EditorStatusCard";
import { SetupChecklist } from "@portal/components/SetupChecklist";
import { useOnboardingProgress } from "@portal/hooks/useOnboardingProgress";
import { ControlledDealStatusHero } from "@portal/components/procurement/ProcurementBanner";
import { ProcurementFlow } from "@portal/components/procurement/ProcurementFlow";
import { useProcurement } from "@portal/components/procurement/useProcurement";

/**
 * The Home hero, composed with a procurement-aware, progress-aware footer:
 *
 *  - no live deployment  → welcome header (+ setup steps until complete)
 *  - deployment live     → deployed-Editor status header (+ steps until complete)
 *  - onboarding complete → header only; the setup steps collapse away
 *  - enterprise          → status header with chips hidden (the deal hero owns invite)
 *
 * The footer is the deal-status hero while a procurement deal is underway
 * (procurement is a bolt-on to any tier); otherwise the setup checklist, until
 * every step is done — then it collapses to just the header, matching the
 * deployed-status card. The procurement takeover modals render alongside.
 */
export function HomeHero({ tier }: { tier: Tier }) {
  const { openLinkModal } = useUI();
  const procurement = useProcurement();
  const progress = useOnboardingProgress();
  const dealActive =
    procurement.isLinked && procurement.started && !!procurement.data;

  // Start the enterprise flow right here on Home: open the trial-setup modal when the account is
  // linked, otherwise prompt to link first — no navigating off to the procurement view.
  const onStartEnterprise = () => {
    if (procurement.isLinked) procurement.onStartTrial();
    else openLinkModal();
  };

  // Steps collapse once onboarding is complete; a live deal always keeps its
  // hero. Otherwise the setup checklist carries the (progress-aware) steps.
  const footer = dealActive ? (
    <ControlledDealStatusHero controller={procurement} />
  ) : progress.allComplete ? undefined : (
    <SetupChecklist progress={progress} onStartEnterprise={onStartEnterprise} />
  );

  // The live-status header (EditorStatusCard) needs a real deployment to show;
  // without one it renders nothing, so route to it only when actually deployed.
  // Everything else — including a step completed via the local download flag —
  // keeps the always-present welcome header, so the card never vanishes.
  const showStatus = progress.deployed;

  return (
    <>
      {showStatus ? (
        <EditorStatusCard footer={footer} hideChips={tier === "enterprise"} />
      ) : (
        <WelcomeBanner footer={footer} />
      )}
      <ProcurementFlow controller={procurement} />
    </>
  );
}
