import type { Meta, StoryObj } from "@storybook/react-vite";
import ToolLoadingFallback from "@app/components/tools/ToolLoadingFallback";

const meta: Meta<typeof ToolLoadingFallback> = {
  title: "Tools/ToolLoadingFallback",
  component: ToolLoadingFallback,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithToolName: Story = {
  args: {
    toolName: "Merge PDF",
  },
};
