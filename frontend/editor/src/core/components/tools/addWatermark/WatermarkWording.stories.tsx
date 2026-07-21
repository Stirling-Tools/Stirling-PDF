import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import WatermarkWording from "@app/components/tools/addWatermark/WatermarkWording";
import {
  AddWatermarkParameters,
  defaultParameters,
} from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

const meta: Meta<typeof WatermarkWording> = {
  title: "AddWatermark/WatermarkWording",
  component: WatermarkWording,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof WatermarkWording>;

function WatermarkWordingDemo({
  initialText = "",
  disabled,
}: {
  initialText?: string;
  disabled?: boolean;
}) {
  const [parameters, setParameters] = useState<AddWatermarkParameters>({
    ...defaultParameters,
    watermarkText: initialText,
  });

  const handleParameterChange = <K extends keyof AddWatermarkParameters>(
    key: K,
    value: AddWatermarkParameters[K],
  ) => {
    setParameters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <WatermarkWording
      parameters={parameters}
      onParameterChange={handleParameterChange}
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <WatermarkWordingDemo /> };

export const Filled: Story = {
  render: () => <WatermarkWordingDemo initialText="CONFIDENTIAL" />,
};

export const Disabled: Story = {
  render: () => <WatermarkWordingDemo initialText="CONFIDENTIAL" disabled />,
};
