import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Overlay PDFs/Panel",
  ...toolPanelMeta("overlayPdfs", {
    files: ["compare_sample_a.pdf", "compare_sample_b.pdf"],
  }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const fixedRepeat = {
  parameters: { overlayMode: "FixedRepeatOverlay" },
} as const;

const overlayFiles = {
  overlayFiles: ["multi-page-sample.pdf", "sample.pdf"],
} as const;

export const Panel: Story = {};

export const FixedRepeat: Story = {
  args: fixedRepeat,
};

export const OverlayFilesChosen: Story = {
  args: { parameterFiles: overlayFiles },
};

export const FixedRepeatCounts: Story = {
  args: {
    parameterFiles: overlayFiles,
    parameters: { overlayMode: "FixedRepeatOverlay", counts: [2, 1] },
  },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const OverlayModeTooltip: Story = {
  play: openTooltip({ info: /^Choose how to distribute overlay pages/ }),
};

export const OverlayPositionTooltip: Story = {
  play: openTooltip({ info: /^Foreground places the overlay/ }),
};

export const OverlayCountsTooltip: Story = {
  args: fixedRepeat,
  play: openTooltip({ info: /^Provide a positive number for each overlay/ }),
};

export const OverlayFilesTooltip: Story = {
  play: openTooltip({ info: /^Select one or more PDFs to overlay/ }),
};

export const OverlayFilesRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};
