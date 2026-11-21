import type { StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  openStep,
  openTooltip,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  toggle,
  typeInto,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Multi-Page Layout/Panel",
  ...toolPanelMeta("pageLayout"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const ADVANCED = "Advanced";
const MARGINS = "Margins & Borders";

async function openAdvanced(context: PlayContext) {
  await openStep(context, ADVANCED);
  return waitForPanelText(context, "Reading Direction");
}

async function openMargins(context: PlayContext) {
  await openStep(context, MARGINS);
  return waitForPanelText(context, "Top Margin");
}

async function marginsTooLarge(context: PlayContext) {
  const panel = await openMargins(context);
  await typeInto(context, "Top Margin", "500");
  await typeInto(context, "Bottom Margin", "400");
  await typeInto(context, "Left Margin", "300");
  await typeInto(context, "Right Margin", "300");
  for (const error of [
    "Top/Bottom margins are too large for this page size.",
    "Left/Right margins are too large for this page size.",
  ])
    await waitFor(
      () => expect(panel.getAllByText(error)).toHaveLength(2),
      STAGE_TIMEOUT,
    );
}

async function innerMarginTooLarge(context: PlayContext) {
  await openMargins(context);
  await typeInto(context, "Inner Margin", "200");
  await waitForPanelText(
    context,
    "Inner margin is too large for the selected layout.",
  );
}

export const Panel: Story = {};

export const NinePagesPerSheet: Story = {
  play: async (context) => {
    await choose(context, "9");
    await waitForPanelText(
      context,
      "Place 9 pages on a single sheet (3 × 3 grid).",
    );
  },
};

export const CustomGrid: Story = {
  play: async (context) => {
    const panel = await choose(context, "Custom");
    await typeInto(context, "Rows", "2");
    await typeInto(context, "Columns", "3");
    await expect(panel.getByRole("textbox", { name: "Columns" })).toHaveValue(
      "3",
    );
  },
};

export const AdvancedSettings: Story = {
  play: openAdvanced,
};

export const AdvancedSettingsChanged: Story = {
  play: async (context) => {
    await openAdvanced(context);
    await choose(context, "Landscape", "By Rows", "Right to Left");
  },
};

export const MarginsAndBorders: Story = {
  play: openMargins,
};

export const Borders: Story = {
  play: async (context) => {
    await openMargins(context);
    await toggle(context, "checkbox", "Add Borders");
    await typeInto(context, "Border Thickness", "3");
  },
};

export const MarginsTooLarge: Story = {
  play: marginsTooLarge,
};

export const InnerMarginTooLarge: Story = {
  play: innerMarginTooLarge,
};

export const MarginsTooLargeTooltip: Story = {
  play: openTooltip({ runButton: true }, { after: marginsTooLarge }),
};

export const LayoutSettingsTooltip: Story = {
  play: openTooltip({ step: "Layout" }),
};

export const AdvancedSettingsTooltip: Story = {
  play: openTooltip({ step: ADVANCED }, { after: openAdvanced }),
};

export const MarginsAndBordersTooltip: Story = {
  play: openTooltip({ step: MARGINS }, { after: openMargins }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/general/multi-page-layout", "sample.pdf"),
  ),
  play: runToResults,
};
