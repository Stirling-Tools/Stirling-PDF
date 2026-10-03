import type { ReactNode } from "react";
import { type OnboardingClosingStepProps } from "@tauri/components/onboarding/OnboardingClosingStep";
import { ClassificationDemoModal } from "@app/components/onboarding/classificationDemo/ClassificationDemoModal";

export { type OnboardingClosingStepProps };

export function OnboardingClosingStep({
  onClose,
}: OnboardingClosingStepProps): ReactNode {
  return <ClassificationDemoModal opened onClose={onClose} />;
}
