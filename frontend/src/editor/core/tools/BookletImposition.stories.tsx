import type { StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
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

const DOUBLE_SIDED = "Double-sided printing";
const FLIP_ON_SHORT_EDGE = "Flip on short edge (automatic duplex only)";

async function manualDuplex(context: PlayContext) {
  await toggle(context, "checkbox", DOUBLE_SIDED);
  return waitForPanelText(context, "Manual Duplex Mode");
}

async function secondPass(context: PlayContext) {
  await manualDuplex(context);
  await choose(context, "2nd Pass");
}

export const Panel: Story = {};

export const ManualDuplexFirstPass: Story = {
  play: async (context) => {
    const panel = await manualDuplex(context);
    await expect(
      panel.getByRole("checkbox", { name: FLIP_ON_SHORT_EDGE }),
    ).toBeDisabled();
  },
};

export const ManualDuplexSecondPass: Story = {
  play: secondPass,
};

export const AllOptionsOn: Story = {
  play: async (context) => {
    for (const name of [
      "Right-to-left binding",
      "Add borders around pages",
      "Add gutter margin",
      FLIP_ON_SHORT_EDGE,
    ])
      await toggle(context, "checkbox", name);
    const gutter = await typeInto(context, "Gutter size", "24");
    await expect(gutter).toHaveValue("24 pt");
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
  play: openTooltip({ info: /^For Arabic, Hebrew/ }),
};

export const AddBordersTooltip: Story = {
  play: openTooltip({ info: /^Adds borders around each page section/ }),
};

export const GutterMarginTooltip: Story = {
  play: openTooltip({ info: /^Adds inner margin space for binding/ }),
};

export const FlipOnShortEdgeTooltip: Story = {
  play: openTooltip({ info: /^Enable for short-edge duplex printing/ }),
};

export const FlipOnShortEdgeManualDuplexTooltip: Story = {
  play: openTooltip(
    { info: /^Not needed in manual mode/ },
    { after: manualDuplex },
  ),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/general/booklet-imposition", "sample.pdf"),
  ),
  play: runToResults,
};
