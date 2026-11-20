import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Rotate/Panel",
  ...toolPanelMeta("rotate"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};
