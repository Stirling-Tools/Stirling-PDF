import type { ReactNode } from "react";

export interface OnboardingClosingStepProps {
  /** Records the step as seen, so it is offered only once. */
  onClose: () => void;
}

/** The platform's offer after the welcome flow ends, shown while automation is enabled. */
export function OnboardingClosingStep(
  _props: OnboardingClosingStepProps,
): ReactNode {
  return null;
}
