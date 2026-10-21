import type { SetupStepProps } from "@app/components/serverSetup/SetupFields";
import { AddressesStep } from "@app/components/serverSetup/steps/AddressesStep";
import { SignInStep } from "@app/components/serverSetup/steps/SignInStep";
import { EmailStep } from "@app/components/serverSetup/steps/EmailStep";
import { AiStep } from "@app/components/serverSetup/steps/AiStep";

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
