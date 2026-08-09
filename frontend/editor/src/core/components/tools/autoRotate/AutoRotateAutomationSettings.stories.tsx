import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AutoRotateAutomationSettings from "@app/components/tools/autoRotate/AutoRotateAutomationSettings";
import {
  defaultParameters,
  type AutoRotateParameters,
} from "@app/hooks/tools/autoRotate/useAutoRotateParameters";

/** The same detection controls as the tool panel, in the form the pipeline
 *  builder embeds — a plain parameters object with a change callback rather
 *  than the tool's own hook. */
const meta: Meta<typeof AutoRotateAutomationSettings> = {
  title: "Tools/AutoRotate/AutoRotateAutomationSettings",
  component: AutoRotateAutomationSettings,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof AutoRotateAutomationSettings>;

function Demo({
  overrides,
  disabled,
}: {
  overrides?: Partial<AutoRotateParameters>;
  disabled?: boolean;
}) {
  const [parameters, setParameters] = useState<AutoRotateParameters>({
    ...defaultParameters,
    ...overrides,
  });
  return (
    <AutoRotateAutomationSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

/** Defaults. */
export const Default: Story = { render: () => <Demo /> };

/** Forced to text-direction detection. */
export const TextOnly: Story = {
  render: () => <Demo overrides={{ detectionMode: "text" }} />,
};

/** Forced to OCR orientation detection. */
export const OsdOnly: Story = {
  render: () => <Demo overrides={{ detectionMode: "osd" }} />,
};

/** A high confidence floor. */
export const StrictConfidence: Story = {
  render: () => <Demo overrides={{ confidenceThreshold: 85 }} />,
};

/** Inert. */
export const Disabled: Story = { render: () => <Demo disabled /> };
