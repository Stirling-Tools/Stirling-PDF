import type { Tier } from "@portal/contexts/TierContext";
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
 *  - not deployed (free, no instance) → marketing welcome header + setup steps
 *  - deployed / paid                  → deployed-Editor status header + steps
 *  - onboarding complete              → header only; the setup steps collapse away
 *  - enterprise                       → status header with chips hidden (the deal hero owns invite)
 *
 * The footer is the deal-status hero while a procurement deal is underway
 * (procurement is a bolt-on to any tier); otherwise the setup checklist, until
 * every step is done — then it collapses to just the header, matching the
 * deployed-status card. The procurement takeover modals render alongside.
 */
export function HomeHero({ tier }: { tier: Tier }) {
  const procurement = useProcurement();
  const progress = useOnboardingProgress();
  const dealActive =
    procurement.isLinked && procurement.started && !!procurement.data;

  // Steps collapse once onboarding is complete; a live deal always keeps its
  // hero. Otherwise the setup checklist carries the (progress-aware) steps.
  const footer = dealActive ? (
    <ControlledDealStatusHero controller={procurement} />
  ) : progress.allComplete ? undefined : (
    <SetupChecklist progress={progress} />
  );

  // Show the deployed-status header once the Editor is live (or on paid tiers);
  // pre-deployment free orgs get the marketing welcome header.
  const showStatus = tier !== "free" || progress.editorDone;

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
