import type { SetupStepProps } from "@editor/components/serverSetup/SetupFields";
import { AddressesStep } from "@editor/components/serverSetup/steps/AddressesStep";
import { SignInStep } from "@editor/components/serverSetup/steps/SignInStep";
import { EmailStep } from "@editor/components/serverSetup/steps/EmailStep";
import { AiStep } from "@editor/components/serverSetup/steps/AiStep";

/** Quick start's settings on one card; must match QUICK_SUMMARY_STEPS. */
export function QuickSummaryStep(props: SetupStepProps) {
  return (
    <>
      <AddressesStep {...props} />
      <SignInStep {...props} />
      <EmailStep {...props} />
      <AiStep {...props} />
    </>
  );
}
