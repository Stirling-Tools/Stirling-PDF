import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add Page Numbers/Panel",
  ...toolPanelMeta("addPageNumbers"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const TopLeftPosition: Story = {
  args: { parameters: { position: 1 } },
};

export const CustomTextFormat: Story = {
  args: { parameters: { customText: "Page {n}", zeroPad: 3 } },
};

export const PagesToNumberTooltip: Story = {
  play: openTooltip({ info: /^Comma-separated page numbers or ranges/ }),
};

export const StartingNumberTooltip: Story = {
  play: openTooltip({ info: /^The first number to display/ }),
};

export const MarginTooltip: Story = {
  play: openTooltip({ info: /^Distance between the page number/ }),
};

export const FontSizeTooltip: Story = {
  play: openTooltip({ info: /^Size of the page number text/ }),
};

export const ZeroPadWidthTooltip: Story = {
  play: openTooltip({ info: /\(Bates Stamp\) page numbers/ }),
};

export const FontTypeTooltip: Story = {
  play: openTooltip({ info: /^Font family for the page numbers/ }),
};

export const CustomTextFormatTooltip: Story = {
  play: openTooltip({ info: /^Optional custom format for page numbers/ }),
};
