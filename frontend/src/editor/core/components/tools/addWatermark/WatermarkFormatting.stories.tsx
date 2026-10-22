import type { Meta, StoryObj } from "@storybook/react-vite";
import WatermarkFormatting from "@app/components/tools/addWatermark/WatermarkFormatting";
import { defaultParameters } from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

const meta = {
  title: "Tools/AddWatermark/WatermarkFormatting",
  component: WatermarkFormatting,
} satisfies Meta<typeof WatermarkFormatting>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: { ...defaultParameters, watermarkType: "text" },
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};

export const WithoutFlattenOption: Story = {
  args: {
    ...Default.args,
    showFlatten: false,
  },
};
