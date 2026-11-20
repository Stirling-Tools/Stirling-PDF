import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  untilPanelShows,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Extract Pages/Panel",
  ...toolPanelMeta("extractPages", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const SyntaxError: Story = {
  args: { parameters: { pageNumbers: "1-3,x" } },
  play: untilPanelShows(/^There is a syntax issue/),
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const PagesRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};
