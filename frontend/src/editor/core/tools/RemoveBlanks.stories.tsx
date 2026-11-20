import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Remove Blank pages/Panel",
  ...toolPanelMeta("removeBlanks", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const AdjustedSettings: Story = {
  play: async (context) => {
    const panel = await waitForPanelText(context, "Pixel Whiteness Threshold");
    const threshold = panel.getByRole("textbox", {
      name: "Pixel Whiteness Threshold",
    });
    await userEvent.clear(threshold);
    await userEvent.type(threshold, "200");
    await userEvent.tab();
    const whitePercent = panel.getByRole("textbox", {
      name: "White Percentage Threshold",
    });
    // Emptying this field sets it straight back to 0.1, so typing after a
    // clear would read 0.195; replacing the selection is what a user can do.
    await userEvent.tripleClick(whitePercent);
    await userEvent.keyboard("95");
    await userEvent.tab();
    await waitFor(() =>
      expect(
        panel.getByRole("slider", {
          name: "White Percentage Threshold",
        }),
      ).toHaveAttribute("aria-valuenow", "95"),
    );
    const includeBlanks = panel.getByRole("checkbox", {
      name: "Include detected blank pages",
    });
    await userEvent.click(includeBlanks);
    await expect(includeBlanks).toBeChecked();
    await expect(threshold).toHaveValue("200");
  },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};
