import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyPiiField } from "@app/components/policies/PolicyPiiField";
import { PII_PRESETS } from "@app/data/policyDefinitions";
import type { RedactParameters } from "@app/hooks/tools/redact/useRedactParameters";

const BASE_PARAMETERS: RedactParameters = {
  mode: "automatic",
  wordsToRedact: [],
  useRegex: false,
  wholeWordSearch: false,
  redactColor: "#000000",
  customPadding: 0.1,
  convertPDFToImage: true,
};

// The field only owns the preset selection; the story holds parameters state
// so selecting/clearing presets is live.
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
      <PolicyPiiField
        parameters={parameters}
        onChange={setParameters}
        disabled={disabled}
      />
    </div>
  );
}

const meta = {
  title: "Policies/PolicyPiiField",
  component: Harness,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No presets selected yet. */
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
      useRegex: true,
      wordsToRedact: [PII_PRESETS[0].pattern, PII_PRESETS[1].pattern],
    },
  },
};

/** Disabled state. */
export const Disabled: Story = {
  args: {
    initialParameters: BASE_PARAMETERS,
    disabled: true,
  },
};
