import type { Meta, StoryObj } from "@storybook/react-vite";
import AdjustPageScaleSettings from "@app/components/tools/adjustPageScale/AdjustPageScaleSettings";
import {
  AdjustPageScaleParameters,
  PageSize,
} from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";

const meta = {
  title: "Tools/AdjustPageScale/AdjustPageScaleSettings",
  component: AdjustPageScaleSettings,
} satisfies Meta<typeof AdjustPageScaleSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

const defaultParameters: AdjustPageScaleParameters = {
  scaleFactor: 1.0,
  pageSize: PageSize.KEEP,
  orientation: "PORTRAIT",
};

export const Default: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
};

export const CustomPageSize: Story = {
  args: {
    parameters: {
      scaleFactor: 2.5,
      pageSize: PageSize.A4,
      orientation: "LANDSCAPE",
    },
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
    disabled: true,
  },
};
