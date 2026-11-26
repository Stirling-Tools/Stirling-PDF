import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";

const meta = {
  title: "Tools/Extract Images/Panel",
  ...toolPanelMeta("extractImages"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};
