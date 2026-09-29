import type { Meta, StoryObj } from "@storybook/react-vite";
import StampPreview from "@app/components/tools/addStamp/StampPreview";
import { defaultParameters } from "@app/components/tools/addStamp/useAddStampParameters";

const meta = {
  title: "Tools/AddStamp/StampPreview",
  component: StampPreview,
} satisfies Meta<typeof StampPreview>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
};

export const WithText: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      stampText: "CONFIDENTIAL",
    },
    onParameterChange: () => {},
  },
};

export const WithQuickGrid: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
    showQuickGrid: true,
  },
};
