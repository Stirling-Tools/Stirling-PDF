import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  untilPanelShows,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Merge/Panel",
  ...toolPanelMeta("merge", {
    files: ["compare_sample_a.pdf", "compare_sample_b.pdf"],
  }),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const ViewerMode: Story = {
  args: { workbench: "viewer" },
  play: untilPanelShows("Go to file editor"),
};

export const SortFilesTooltip: Story = {
  play: openTooltip({ step: "Sort Files" }),
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const SecondFileRequiredTooltip: Story = {
  args: { files: ["sample.pdf"] },
  play: openTooltip({ runButton: true }),
};

export const ViewerModeTooltip: Story = {
  args: { workbench: "viewer" },
  play: openTooltip(
    { runButton: true },
    { after: untilPanelShows("Go to file editor") },
  ),
};
