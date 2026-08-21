import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CropAutomationSettings from "@app/components/tools/crop/CropAutomationSettings";
import {
  CropParameters,
  defaultParameters,
} from "@app/hooks/tools/crop/useCropParameters";

const meta = {
  title: "Tools/Crop/CropAutomationSettings",
  component: CropAutomationSettings,
  parameters: { layout: "padded" },
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof CropAutomationSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function SettingsDemo({
  initialParameters = defaultParameters,
  disabled,
}: {
  initialParameters?: CropParameters;
  disabled?: boolean;
}) {
  const [parameters, setParameters] =
    useState<CropParameters>(initialParameters);

  return (
    <CropAutomationSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <SettingsDemo />,
};

export const CustomArea: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{
        ...defaultParameters,
        cropArea: { x: 50, y: 50, width: 400, height: 600 },
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => <SettingsDemo disabled />,
};
