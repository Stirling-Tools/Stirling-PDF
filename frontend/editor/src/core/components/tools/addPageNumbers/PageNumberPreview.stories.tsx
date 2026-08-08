import type { Meta, StoryObj } from "@storybook/react-vite";
import PageNumberPreview from "@app/components/tools/addPageNumbers/PageNumberPreview";
import { defaultParameters } from "@app/components/tools/addPageNumbers/useAddPageNumbersParameters";

const meta = {
  title: "Tools/AddPageNumbers/PageNumberPreview",
  component: PageNumberPreview,
} satisfies Meta<typeof PageNumberPreview>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: defaultParameters,
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
