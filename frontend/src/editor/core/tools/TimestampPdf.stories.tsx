import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Timestamp PDF/Panel",
  ...toolPanelMeta("timestampPdf"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const TimestampServerTooltip: Story = {
  play: openTooltip({ info: /^Only a SHA-256 hash of your document/ }),
};
