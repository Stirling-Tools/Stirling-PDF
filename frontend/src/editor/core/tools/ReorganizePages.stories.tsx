import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  STAGE_TIMEOUT,
  waitForToolPanel,
  type PlayContext,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Reorganize Pages/Panel",
  ...toolPanelMeta("reorganizePages", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The mode lives in the tool's own state, not useBaseParameters, so a preset is picked from the menu. */
async function pickMode(context: PlayContext, mode: string) {
  const panel = within(await waitForToolPanel(context));
  const select = await panel.findByRole(
    "textbox",
    { name: /^Organization mode/ },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(select).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(select);
  const body = within(context.canvasElement.ownerDocument.body);
  await userEvent.click(
    await body.findByRole("option", { name: mode }, STAGE_TIMEOUT),
  );
  await waitFor(() => expect(select).toHaveValue(mode));
  return panel;
}

export const Panel: Story = {};

export const PresetMode: Story = {
  play: async (context) => {
    const panel = await pickMode(context, "Reverse Order");
    await waitFor(() => expect(panel.queryByText("Page Order")).toBeNull());
  },
};

export const OrganizationModeTooltip: Story = {
  play: openTooltip({ info: /^Use a custom sequence of page numbers/ }),
};

export const PresetModeTooltip: Story = {
  play: openTooltip(
    { info: /^Flip the document/ },
    { after: (context) => pickMode(context, "Reverse Order") },
  ),
};

export const PageOrderTooltip: Story = {
  play: openTooltip({ info: /^A comma-separated list of page numbers/ }),
};

export const PageOrderRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};
