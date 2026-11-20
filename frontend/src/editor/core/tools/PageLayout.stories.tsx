import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Multi-Page Layout/Panel",
  ...toolPanelMeta("pageLayout"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const CustomGrid: Story = {
  args: { parameters: { mode: "CUSTOM", rows: 2, cols: 3 } },
};

export const Borders: Story = {
  args: { parameters: { addBorder: true, borderWidth: 2 } },
};

export const MarginsTooLarge: Story = {
  args: {
    parameters: {
      topMargin: 500,
      bottomMargin: 400,
      leftMargin: 300,
      rightMargin: 300,
      innerMargin: 50,
    },
  },
};

export const LayoutTooltip: Story = {
  play: openTooltip({ step: "Layout" }),
};

export const MarginsAndBordersTooltip: Story = {
  play: openTooltip({ step: "Margins & Borders" }),
};

export const AdvancedTooltip: Story = {
  play: openTooltip({ step: "Advanced" }),
};
