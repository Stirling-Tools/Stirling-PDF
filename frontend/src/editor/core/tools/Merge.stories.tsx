import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openSelect,
  openTooltip,
  runToResults,
  selectOption,
  toggle,
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

export const SortByOptions: Story = {
  play: async (context) => {
    const options = await openSelect(context, "Sort By");
    await expect(
      options.getByRole("option", { name: "Date Modified" }),
    ).toBeVisible();
  },
};

export const SortDescendingByDate: Story = {
  play: async (context) => {
    const panel = await selectOption(context, "Sort By", "Date Modified");
    await userEvent.click(panel.getByRole("button", { name: "Ascending" }));
    await expect(
      panel.getByRole("button", { name: "Descending" }),
    ).toBeVisible();
    await expect(panel.getByRole("textbox", { name: "Sort By" })).toHaveValue(
      "Date Modified",
    );
    await userEvent.click(panel.getByRole("button", { name: "Sort" }));
  },
};

export const SortFilesTooltip: Story = {
  play: openTooltip({ step: "Sort Files" }),
};

export const BothSettingsOn: Story = {
  play: async (context) => {
    for (const name of [
      "Remove digital signature in the merged file?",
      "Generate table of contents in the merged file?",
    ])
      await toggle(context, "checkbox", name);
  },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const SecondFileRequired: Story = {
  args: { files: ["sample.pdf"] },
};

export const SecondFileRequiredTooltip: Story = {
  args: { files: ["sample.pdf"] },
  play: openTooltip({ runButton: true }),
};

export const ViewerMode: Story = {
  args: { workbench: "viewer" },
  play: untilPanelShows("Go to file editor"),
};

export const ViewerModeTooltip: Story = {
  args: { workbench: "viewer" },
  play: openTooltip(
    { runButton: true },
    { after: untilPanelShows("Go to file editor") },
  ),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/general/merge-pdfs", "sample.pdf"),
  ),
  play: runToResults,
};
