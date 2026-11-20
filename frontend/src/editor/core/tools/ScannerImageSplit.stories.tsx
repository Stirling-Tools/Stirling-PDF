import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Detect & Split Scanned Photos/Panel",
  ...toolPanelMeta("scannerImageSplit", { files: ["scanned-no-ocr.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const AngleThresholdTooltip: Story = {
  play: openTooltip({ info: /^Tilt \(in degrees\)/ }),
};

export const ToleranceTooltip: Story = {
  play: openTooltip({ info: /^How closely a color must match/ }),
};

export const MinimumAreaTooltip: Story = {
  play: openTooltip({ info: /^Smallest photo size/ }),
};

export const MinimumContourAreaTooltip: Story = {
  play: openTooltip({ info: /^Smallest edge\/shape/ }),
};

export const BorderSizeTooltip: Story = {
  play: openTooltip({ info: /^Extra padding/ }),
};
