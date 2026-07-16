import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AdjustContrastColorSettings from "@app/components/tools/adjustContrast/AdjustContrastColorSettings";
import {
  AdjustContrastParameters,
  defaultParameters,
} from "@app/hooks/tools/adjustContrast/useAdjustContrastParameters";

const meta = {
  title: "Tools/AdjustContrast/AdjustContrastColorSettings",
  component: AdjustContrastColorSettings,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AdjustContrastColorSettings>;
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
    <AdjustContrastColorSettings
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
        red: 140,
        green: 80,
        blue: 120,
      }}
    />
  ),
};

export const Disabled: Story = { render: () => <Demo disabled /> };
