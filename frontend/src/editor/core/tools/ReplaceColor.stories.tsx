import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Replace & Invert Color/Panel",
  ...toolPanelMeta("replaceColor"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const CustomColors: Story = {
  args: {
    parameters: {
      replaceAndInvertOption: "CUSTOM_COLOR",
      textColor: "#1f3a93", // theme-allow-color a user-picked colour the tool sends to the server
      backGroundColor: "#fff8e1", // theme-allow-color a user-picked colour the tool sends to the server
    },
  },
};

export const InvertAllColours: Story = {
  args: { parameters: { replaceAndInvertOption: "FULL_INVERSION" } },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};
