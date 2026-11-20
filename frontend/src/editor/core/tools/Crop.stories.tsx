import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Crop PDF/Panel",
  ...toolPanelMeta("crop"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const AutoCropWhitespace: Story = {
  args: { parameters: { autoCrop: true } },
};

export const InvalidPageSelection: Story = {
  args: { parameters: { pageNumbers: "3-" } },
};

export const SelectCropAreaTooltip: Story = {
  play: openTooltip({ step: "Select Crop Area" }),
};

export const PagesToCropTooltip: Story = {
  play: openTooltip({ info: /^Crop the selected area on specific pages/ }),
};
