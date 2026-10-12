import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import WatermarkTypeSettings from "@app/components/tools/addWatermark/WatermarkTypeSettings";

const meta: Meta<typeof WatermarkTypeSettings> = {
  title: "Tools/AddWatermark/WatermarkTypeSettings",
  component: WatermarkTypeSettings,
};
export default meta;
type Story = StoryObj<typeof WatermarkTypeSettings>;

function WatermarkTypeSettingsDemo({ disabled }: { disabled?: boolean }) {
  const [watermarkType, setWatermarkType] = useState<"text" | "image">("text");

  return (
    <WatermarkTypeSettings
      watermarkType={watermarkType}
      onWatermarkTypeChange={setWatermarkType}
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <WatermarkTypeSettingsDemo /> };

export const Disabled: Story = {
  render: () => <WatermarkTypeSettingsDemo disabled />,
};
