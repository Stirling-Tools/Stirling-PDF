/**
 * SaaS tour runner.
 *
 * The core onboarding orchestrator (which normally drives the guided tour) is
 * not mounted in SaaS — SaaS uses SaasOnboardingModal for onboarding instead.
 * So this component listens for the shared start-tour event (e.g. the
 * getting-started checklist's "Take the tour") and drives the shared reactour
 * presentation directly.
 *
 * Only the user "tools" walkthrough is offered in SaaS; there is no admin tour
 * here. The admin orchestration context is still resolved because the tools
 * tour's step builder uses it to open the settings Help section.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type StepType } from "@reactour/tour";
import ReactourTour, {
  type AdvanceArgs,
  type CloseArgs,
} from "@core/components/onboarding/OnboardingTour";
import { getTourSteps } from "@app/components/onboarding/tourRegistry";
import { useTourRequest } from "@app/components/onboarding/useOnboardingEffects";
import { useTourOrchestration } from "@app/contexts/TourOrchestrationContext";
import { useAdminTourOrchestration } from "@app/contexts/AdminTourOrchestrationContext";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { dispatchTourState } from "@app/constants/events";
import { removeAllGlows } from "@app/components/onboarding/tourGlow";
import "@core/components/onboarding/OnboardingTour.css";

export default function OnboardingTour() {
  const { t } = useTranslation();
  const workbench = useTourOrchestration();
  const admin = useAdminTourOrchestration();
  const { openFilesModal, closeFilesModal } = useFilesModalContext();
  const { tourRequested, requestedTourType, clearTourRequest } =
    useTourRequest();

  const [isOpen, setIsOpen] = useState(false);
  const [tourType, setTourType] = useState<string>("tools");

  const isRTL =
    typeof document !== "undefined"
      ? document.documentElement.dir === "rtl"
      : false;

  // Let the rest of the app know a tour is running (e.g. to hide cookie consent).
  useEffect(() => dispatchTourState(isOpen), [isOpen]);

  // Open on request (the checklist dispatches "tools").
  useEffect(() => {
    if (tourRequested) {
      setTourType(requestedTourType);
      setIsOpen(true);
      clearTourRequest();
    }
  }, [tourRequested, requestedTourType, clearTourRequest]);

  useEffect(() => {
    if (!isOpen) removeAllGlows();
    return () => removeAllGlows();
  }, [isOpen]);

  const tourSteps = useMemo<StepType[]>(
    () =>
      getTourSteps(tourType, {
        t,
        workbench,
        admin,
        openFilesModal,
        closeFilesModal,
      }),
    [tourType, t, workbench, admin, openFilesModal, closeFilesModal],
  );

  const finishTour = useCallback(() => {
    setIsOpen(false);
    void workbench.restoreWorkbenchState();
  }, [workbench]);

  const handleAdvance = useCallback(
    (args: AdvanceArgs) => {
      const {
        setCurrentStep,
        currentStep,
        steps,
        setIsOpen: setReactourOpen,
      } = args;
      if (steps && currentStep === steps.length - 1) {
        setReactourOpen(false);
        finishTour();
      } else if (steps) {
        setCurrentStep((s) => (s === steps.length - 1 ? 0 : s + 1));
      }
    },
    [finishTour],
  );

  const handleClose = useCallback(
    (args: CloseArgs) => {
      args.setIsOpen(false);
      finishTour();
    },
    [finishTour],
  );

  return (
    <ReactourTour
      isOpen={isOpen}
      tourSteps={tourSteps}
      tourType={tourType}
      isRTL={isRTL}
      t={t}
      onAdvance={handleAdvance}
      onClose={handleClose}
    />
  );
}
