import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  untilPanelShows,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Remove Pages/Panel",
  ...toolPanelMeta("removePages", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const InvalidPageNumbers: Story = {
  args: { parameters: { pageNumbers: "1-3,x" } },
  play: untilPanelShows(/^Invalid page number format/),
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const PagesRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};
