import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import WatermarkStyleSettings from "@app/components/tools/addWatermark/WatermarkStyleSettings";
import {
  AddWatermarkParameters,
  defaultParameters,
} from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

const meta: Meta<typeof WatermarkStyleSettings> = {
  title: "Tools/AddWatermark/WatermarkStyleSettings",
  component: WatermarkStyleSettings,
};
export default meta;
type Story = StoryObj<typeof WatermarkStyleSettings>;

function WatermarkStyleSettingsDemo({ disabled }: { disabled?: boolean }) {
  const [parameters, setParameters] = useState<AddWatermarkParameters>({
    ...defaultParameters,
    watermarkType: "text",
    watermarkText: "CONFIDENTIAL",
  });

  return (
    <WatermarkStyleSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <WatermarkStyleSettingsDemo /> };

export const Disabled: Story = {
  render: () => <WatermarkStyleSettingsDemo disabled />,
};
