import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";

const meta = {
  title: "Tools/Remove Certificate Sign/Panel",
  ...toolPanelMeta("removeCertSign", { files: ["signed-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};
