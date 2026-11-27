import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";

const meta = {
  title: "Tools/Remove image/Panel",
  ...toolPanelMeta("removeImage"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};
