import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { expect } from "storybook/test";
import {
  openTooltip,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Create Portfolio/Panel",
  ...toolPanelMeta("createPortfolio", {
    files: ["compare_sample_a.pdf", "compare_sample_b.pdf"],
  }),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const ViewerMode: Story = {
  args: { workbench: "viewer" },
  play: async (context) => {
    const panel = await waitForPanelText(
      context,
      /^A portfolio needs 2 or more files/,
    );
    await expect(
      panel.getByRole("button", { name: "Go to file editor" }),
    ).toBeVisible();
  },
};

export const ViewerModeTooltip: Story = {
  args: { workbench: "viewer" },
  play: openTooltip({ runButton: true }),
};

export const PortfolioSettingsTooltip: Story = {
  play: openTooltip({ step: "Portfolio Settings" }),
};

export const CoverTitleTooltip: Story = {
  play: openTooltip({ info: /^Every selected file is kept whole/ }),
};
