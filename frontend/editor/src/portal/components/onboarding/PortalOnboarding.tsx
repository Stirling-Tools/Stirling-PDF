import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OnboardingSlideShell, {
  type ShellButton,
} from "@app/components/onboarding/OnboardingSlideShell";
// Imported from @core (not @app) on purpose: the SaaS layer shadows this module
// with a no-op stub to suppress the *editor* tour, but the portal wants the real
// reactour wrapper in every flavor.
import OnboardingTour, {
  type AdvanceArgs,
  type CloseArgs,
} from "@core/components/onboarding/OnboardingTour";
import { createLightSlideBackground } from "@app/components/onboarding/slides/unifiedBackgroundConfig";
import {
  hasSeenFlow,
  markFlowSeen,
} from "@app/components/onboarding/orchestrator/onboardingStorage";
import { createPortalTourSteps } from "@portal/components/onboarding/portalTourSteps";

const FLOW_ID = "portal";

const WELCOME_BG = createLightSlideBackground([37, 99, 235], "#DBEAFE");

type Phase = "welcome" | "tour" | "done";

/**
 * Portal-only first-visit onboarding: a welcome, then an optional "show me
 * around" tour that walks the left-nav sections. Shown once per user (persisted
 * via the shared per-flow store); renders nothing thereafter.
 */
export default function PortalOnboarding() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>(() =>
    hasSeenFlow(FLOW_ID) ? "done" : "welcome",
  );

  const tourSteps = useMemo(
    () => createPortalTourSteps(navigate, t),
    [navigate, t],
  );
  const isRTL =
    typeof document !== "undefined" && document.documentElement.dir === "rtl";

  const finish = () => {
    markFlowSeen(FLOW_ID);
    setPhase("done");
  };

  const handleAction = (action: string) => {
    if (action === "tour") {
      setPhase("tour");
    } else {
      finish();
    }
  };

  // Tour runs to its last step, or is closed early → done either way.
  const handleAdvanceTour = (args: AdvanceArgs) => {
    const { setCurrentStep, currentStep, steps, setIsOpen } = args;
    if (steps && currentStep === steps.length - 1) {
      setIsOpen(false);
      finish();
    } else if (steps) {
      setCurrentStep((s) => s + 1);
    }
  };
  const handleCloseTour = (args: CloseArgs) => {
    args.setIsOpen(false);
    finish();
  };

  const tour = (
    <OnboardingTour
      isOpen={phase === "tour"}
      tourSteps={tourSteps}
      tourType="portal"
      isRTL={isRTL}
      t={t}
      onAdvance={handleAdvanceTour}
      onClose={handleCloseTour}
      // Keep the section visible while walking the nav — the app's active-nav
      // highlight + the popover mark the current step.
      dimBackground={false}
    />
  );

  if (phase === "welcome") {
    const buttons: ShellButton[] = [
      {
        key: "portal-welcome-skip",
        label: "Skip",
        variant: "secondary",
        group: "left",
        action: "close",
      },
      {
        key: "portal-welcome-tour",
        label: "Show me around",
        variant: "primary",
        group: "right",
        action: "tour",
      },
    ];
    return (
      <>
        <OnboardingSlideShell
          heroType="logo"
          background={WELCOME_BG}
          slideKey="portal-welcome"
          title="Welcome to the Stirling Processor"
          body={
            <span>
              The Processor runs <strong>Policies</strong> — automated rules
              that classify, secure, and organise every document that arrives.
              Take a quick tour to see how it's laid out.
            </span>
          }
          stepIndex={0}
          stepCount={1}
          buttons={buttons}
          onAction={handleAction}
          onClose={finish}
        />
        {tour}
      </>
    );
  }

  // phase === "tour" (only the spotlight) or "done" (tour closed → renders null).
  return tour;
}
