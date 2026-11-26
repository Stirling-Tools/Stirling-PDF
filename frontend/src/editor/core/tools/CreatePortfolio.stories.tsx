import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  panelOf,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
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

async function typeCoverTitle(context: PlayContext) {
  const panel = await panelOf(context);
  const title = await panel.findByRole(
    "textbox",
    { name: "Cover page title" },
    STAGE_TIMEOUT,
  );
  await userEvent.type(title, "Quarterly reports");
  await expect(title).toHaveValue("Quarterly reports");
}

export const Panel: Story = {};

export const CoverTitle: Story = {
  play: typeCoverTitle,
};

export const PortfolioSettingsTooltip: Story = {
  play: openTooltip({ step: "Portfolio Settings" }),
};

export const CoverTitleTooltip: Story = {
  play: openTooltip({ info: /^The heading on the cover page/ }),
};

export const OneFile: Story = {
  args: { files: ["sample.pdf"] },
};

export const OneFileTooltip: Story = {
  args: { files: ["sample.pdf"] },
  play: openTooltip({ runButton: true }),
};

export const NoFiles: Story = {
  args: { files: [] },
};

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

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/misc/create-portfolio", "sample.pdf"),
  ),
  play: runToResults,
};
