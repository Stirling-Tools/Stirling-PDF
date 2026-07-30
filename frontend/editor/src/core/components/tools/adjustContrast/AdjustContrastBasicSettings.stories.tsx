import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AdjustContrastBasicSettings from "@app/components/tools/adjustContrast/AdjustContrastBasicSettings";
import {
  AdjustContrastParameters,
  defaultParameters,
} from "@app/hooks/tools/adjustContrast/useAdjustContrastParameters";

const meta = {
  title: "Tools/AdjustContrast/AdjustContrastBasicSettings",
  component: AdjustContrastBasicSettings,
  parameters: { layout: "padded" },
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof AdjustContrastBasicSettings>;
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
    <AdjustContrastBasicSettings
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
      }}
    />
  ),
};

export const Disabled: Story = { render: () => <Demo disabled /> };
