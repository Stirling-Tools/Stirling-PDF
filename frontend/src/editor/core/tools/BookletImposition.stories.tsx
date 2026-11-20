import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  openTooltip,
  type PlayContext,
  runToResults,
  toggle,
  typeInto,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Booklet Imposition/Panel",
  ...toolPanelMeta("bookletImposition"),
};
export default meta;

type Story = StoryObj<typeof meta>;

async function manualDuplex(context: PlayContext) {
  await toggle(context, "checkbox", "Double-sided printing");
  return waitForPanelText(context, "Manual Duplex Mode");
}

async function secondPass(context: PlayContext) {
  await manualDuplex(context);
  await choose(context, "2nd Pass");
}

async function openAdvanced(context: PlayContext) {
  const panel = await waitForPanelText(context, "Advanced Options");
  const header = panel.getByRole("button", { name: "Advanced Options" });
  await userEvent.click(header);
  await waitFor(() => expect(header).toHaveAttribute("aria-expanded", "true"));
  return panel;
}

async function manualDuplexAdvanced(context: PlayContext) {
  await manualDuplex(context);
  return openAdvanced(context);
}

export const Panel: Story = {};

export const ManualDuplexFirstPass: Story = {
  play: manualDuplex,
};

export const ManualDuplexSecondPass: Story = {
  play: secondPass,
};

export const AdvancedOptions: Story = {
  play: openAdvanced,
};

export const AdvancedOptionsAllOn: Story = {
  play: async (context) => {
    await openAdvanced(context);
    for (const name of [
      "Right-to-left binding",
      "Add borders around pages",
      "Add gutter margin",
      "Flip on short edge (automatic duplex only)",
    ])
      await toggle(context, "checkbox", name);
    const gutter = await typeInto(context, "Gutter size (points)", "24");
    await expect(gutter).toHaveValue("24");
  },
};

export const AdvancedOptionsManualDuplex: Story = {
  play: async (context) => {
    const panel = await manualDuplexAdvanced(context);
    await expect(
      panel.getByRole("checkbox", {
        name: "Flip on short edge (automatic duplex only)",
      }),
    ).toBeDisabled();
  },
};

export const SettingsTooltip: Story = {
  // The tooltip's body scrolls but cannot take keyboard focus.
  parameters: knownA11yIssues("scrollable-region-focusable"),
  play: openTooltip({ step: "Settings" }),
};

export const DoubleSidedTooltip: Story = {
  play: openTooltip({ info: /^Creates both front and back sides/ }),
};

export const ManualDuplexTooltip: Story = {
  play: openTooltip(
    { info: /^For printers without automatic duplex/ },
    { after: manualDuplex },
  ),
};

export const FirstPassTooltip: Story = {
  play: openTooltip({ info: /^Prints front sides/ }, { after: manualDuplex }),
};

export const SecondPassTooltip: Story = {
  play: openTooltip(
    { info: /^Load printed stack face-down/ },
    { after: secondPass },
  ),
};

export const RightToLeftBindingTooltip: Story = {
  play: openTooltip({ info: /^For Arabic, Hebrew/ }, { after: openAdvanced }),
};

export const AddBordersTooltip: Story = {
  play: openTooltip(
    { info: /^Adds borders around each page section/ },
    { after: openAdvanced },
  ),
};

export const GutterMarginTooltip: Story = {
  play: openTooltip(
    { info: /^Adds inner margin space for binding/ },
    { after: openAdvanced },
  ),
};

export const FlipOnShortEdgeTooltip: Story = {
  play: openTooltip(
    { info: /^Enable for short-edge duplex printing/ },
    { after: openAdvanced },
  ),
};

export const FlipOnShortEdgeManualDuplexTooltip: Story = {
  play: openTooltip(
    { info: /^Not needed in manual mode/ },
    { after: manualDuplexAdvanced },
  ),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/general/booklet-imposition", "sample.pdf"),
  ),
  play: runToResults,
};
