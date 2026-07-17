import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AdjustContrastSingleStepSettings from "@app/components/tools/adjustContrast/AdjustContrastSingleStepSettings";
import {
  AdjustContrastParameters,
  defaultParameters,
} from "@app/hooks/tools/adjustContrast/useAdjustContrastParameters";

const meta = {
  title: "Tools/AdjustContrast/AdjustContrastSingleStepSettings",
  component: AdjustContrastSingleStepSettings,
  parameters: { layout: "padded" },
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof AdjustContrastSingleStepSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({
  initialParameters = defaultParameters,
  disabled,
}: {
  initialParameters?: AdjustContrastParameters;
  disabled?: boolean;
}) {
  const [parameters, setParameters] =
    useState<AdjustContrastParameters>(initialParameters);

  return (
    <AdjustContrastSingleStepSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <Demo /> };

export const Adjusted: Story = {
  render: () => (
    <Demo
      initialParameters={{
        ...defaultParameters,
        contrast: 140,
        brightness: 80,
        saturation: 120,
        red: 110,
        green: 90,
        blue: 105,
      }}
    />
  ),
};

export const Disabled: Story = { render: () => <Demo disabled /> };
