import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { PageSize } from "@editor/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";

const meta = {
  title: "Tools/Adjust page size & scale/Panel",
  ...toolPanelMeta("scalePages"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const StandardPageSize: Story = {
  args: { parameters: { pageSize: PageSize.A4 } },
};

export const CustomPageSize: Story = {
  args: { parameters: { pageSize: PageSize.CUSTOM } },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};
