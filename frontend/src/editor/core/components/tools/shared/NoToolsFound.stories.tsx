import type { Meta, StoryObj } from "@storybook/react-vite";
import NoToolsFound from "@editor/components/tools/shared/NoToolsFound";

const meta = {
  title: "Tools/Shared/NoToolsFound",
  component: NoToolsFound,
} satisfies Meta<typeof NoToolsFound>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
