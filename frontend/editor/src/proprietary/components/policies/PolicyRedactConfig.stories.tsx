import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyRedactConfig } from "@app/components/policies/PolicyRedactConfig";
import { PII_PRESETS } from "@app/data/policyDefinitions";
import type { RedactParameters } from "@app/hooks/tools/redact/useRedactParameters";

const BASE_PARAMETERS: RedactParameters = {
  mode: "automatic",
  wordsToRedact: [],
  useRegex: true,
  wholeWordSearch: false,
  redactColor: "#000000",
  customPadding: 0.1,
  convertPDFToImage: true,
};

// onChange must be wired up for real, since the component normalises its
// params via an onChange call on mount.
function Harness({
  initialParameters,
  disabled,
}: {
  initialParameters: RedactParameters;
  disabled?: boolean;
}) {
  const [parameters, setParameters] =
    useState<RedactParameters>(initialParameters);
  return (
    <div style={{ maxWidth: 360 }}>
      <PolicyRedactConfig
        parameters={parameters}
        onChange={setParameters}
        disabled={disabled}
      />
    </div>
  );
}

const meta = {
  title: "Policies/PolicyRedactConfig",
  component: Harness,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No PII presets selected yet. */
export const Default: Story = {
  args: {
    initialParameters: BASE_PARAMETERS,
  },
};

/** SSN and credit card presets pre-selected. */
export const WithSelection: Story = {
  args: {
    initialParameters: {
      ...BASE_PARAMETERS,
      wordsToRedact: [PII_PRESETS[0].pattern, PII_PRESETS[1].pattern],
    },
  },
};

/** Locked, e.g. when the policy step is view-only. */
export const Disabled: Story = {
  args: {
    initialParameters: BASE_PARAMETERS,
    disabled: true,
  },
};
