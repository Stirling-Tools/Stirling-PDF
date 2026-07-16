import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import WatermarkTextStyle from "@app/components/tools/addWatermark/WatermarkTextStyle";
import {
  AddWatermarkParameters,
  defaultParameters,
} from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

const meta: Meta<typeof WatermarkTextStyle> = {
  title: "AddWatermark/WatermarkTextStyle",
  component: WatermarkTextStyle,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof WatermarkTextStyle>;

function WatermarkTextStyleDemo({
  initialParameters = defaultParameters,
  disabled,
}: {
  initialParameters?: AddWatermarkParameters;
  disabled?: boolean;
}) {
  const [parameters, setParameters] =
    useState<AddWatermarkParameters>(initialParameters);
  return (
    <WatermarkTextStyle
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <WatermarkTextStyleDemo /> };

export const Disabled: Story = {
  render: () => <WatermarkTextStyleDemo disabled />,
};
