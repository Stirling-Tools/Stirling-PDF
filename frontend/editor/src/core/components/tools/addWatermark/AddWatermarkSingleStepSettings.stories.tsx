import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AddWatermarkSingleStepSettings from "@app/components/tools/addWatermark/AddWatermarkSingleStepSettings";
import {
  AddWatermarkParameters,
  defaultParameters,
} from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

const meta = {
  title: "Tools/AddWatermark/AddWatermarkSingleStepSettings",
  component: AddWatermarkSingleStepSettings,
  parameters: { layout: "padded" },
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof AddWatermarkSingleStepSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function SettingsDemo({
  initialParameters = defaultParameters,
  disabled,
  showFlatten,
  textOnly,
}: {
  initialParameters?: AddWatermarkParameters;
  disabled?: boolean;
  showFlatten?: boolean;
  textOnly?: boolean;
}) {
  const [parameters, setParameters] =
    useState<AddWatermarkParameters>(initialParameters);

  return (
    <AddWatermarkSingleStepSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
      showFlatten={showFlatten}
      textOnly={textOnly}
    />
  );
}

export const Default: Story = {
  render: () => <SettingsDemo />,
};

export const TextWatermark: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{
        ...defaultParameters,
        watermarkType: "text",
        watermarkText: "CONFIDENTIAL",
      }}
    />
  ),
};

export const TextOnly: Story = {
  render: () => (
    <SettingsDemo
      textOnly
      initialParameters={{
        ...defaultParameters,
        watermarkText: "DRAFT",
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <SettingsDemo
      disabled
      initialParameters={{
        ...defaultParameters,
        watermarkType: "text",
        watermarkText: "CONFIDENTIAL",
      }}
    />
  ),
};
