import type { ComponentType } from "react";
import type { SetupStepProps } from "@editor/components/serverSetup/SetupFields";
import type { SetupStepId } from "@editor/components/serverSetup/serverSetupDraft";
import { AddressesStep } from "@editor/components/serverSetup/steps/AddressesStep";
import { SignInStep } from "@editor/components/serverSetup/steps/SignInStep";
import { EmailStep } from "@editor/components/serverSetup/steps/EmailStep";
import { AiStep } from "@editor/components/serverSetup/steps/AiStep";

/** Must match QUICK_SUMMARY_STEPS, in the same order. */
const SUMMARY_PARTS: [SetupStepId, ComponentType<SetupStepProps>][] = [
  ["addresses", AddressesStep],
  ["signIn", SignInStep],
  ["email", EmailStep],
  ["ai", AiStep],
];

/** Quick start's settings on one card, without those the server already has. */
export function QuickSummaryStep(props: SetupStepProps) {
  return (
    <>
      {SUMMARY_PARTS.filter(([id]) => !props.configuredSteps.has(id)).map(
        ([id, Part]) => (
          <Part key={id} {...props} />
        ),
      )}
    </>
  );
}
