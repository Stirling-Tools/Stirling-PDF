import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PII_PRESETS } from "@app/data/policyDefinitions";
import {
  defaultParameters,
  type RedactParameters,
} from "@app/hooks/tools/redact/useRedactParameters";
import { PolicyPiiField } from "@app/components/policies/PolicyPiiField";

const meta: Meta<typeof PolicyPiiField> = {
  title: "Portal/Policies/PolicyPiiField",
  component: PolicyPiiField,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PolicyPiiField>;

/** Holds the redact parameters in local state, exercising onChange. */
function Controlled({ initial }: { initial: Partial<RedactParameters> }) {
  const [parameters, setParameters] = useState<RedactParameters>({
    ...defaultParameters,
    ...initial,
  });
  return <PolicyPiiField parameters={parameters} onChange={setParameters} />;
}

/** The security preset's default posture: the high-risk PII types selected. */
export const Preselected: Story = {
  render: () => (
    <Controlled
      initial={{
        mode: "automatic",
        useRegex: true,
        wordsToRedact: PII_PRESETS.slice(0, 2).map((p) => p.pattern),
      }}
    />
  ),
};

/**
 * Nothing selected — the state the wizard's save gate refuses (an automatic
 * redact with no patterns silently does nothing). The field is marked required.
 */
export const Empty: Story = {
  render: () => (
    <Controlled
      initial={{ mode: "automatic", useRegex: true, wordsToRedact: [] }}
    />
  ),
};
