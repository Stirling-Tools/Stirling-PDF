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
  findEnabled,
  openSelect,
  openTooltip,
  type PlayContext,
  runToResults,
  selectOption,
  typeInto,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Adjust page size & scale/Panel",
  ...toolPanelMeta("scalePages"),
};
export default meta;

type Story = StoryObj<typeof meta>;

function pickPageSize(size: string) {
  return (context: PlayContext) =>
    selectOption(context, "Target Page Size", size);
}

const pickCustomSize = pickPageSize("Custom");

async function clearCustomWidth(context: PlayContext) {
  await pickCustomSize(context);
  await userEvent.clear(await findEnabled(context, "textbox", "Width"));
}

export const Panel: Story = {};

export const PageSizeOptions: Story = {
  // The page size listbox scrolls but cannot take keyboard focus.
  parameters: knownA11yIssues("scrollable-region-focusable"),
  play: async (context) => {
    const sizes = await openSelect(context, "Target Page Size");
    await expect(sizes.getByRole("option", { name: "Legal" })).toBeVisible();
  },
};

export const ScaleFactor: Story = {
  play: async (context) => {
    const scale = await typeInto(context, "Scale Factor", "1.5");
    await expect(scale).toHaveValue("1.5");
  },
};

export const StandardPageSizeLandscape: Story = {
  play: async (context) => {
    await pickPageSize("A4")(context);
    await choose(context, "Landscape");
  },
};

export const CustomPageSize: Story = {
  play: pickCustomSize,
};

export const CustomPageSizeInInches: Story = {
  play: async (context) => {
    const panel = await pickCustomSize(context);
    await choose(context, "in");
    await waitFor(() =>
      expect(panel.getByRole("textbox", { name: "Width" })).toHaveValue("8.27"),
    );
  },
};

export const CustomSizeOutOfRange: Story = {
  play: clearCustomWidth,
};

export const CustomSizeOutOfRangeTooltip: Story = {
  play: openTooltip({ runButton: true }, { after: clearCustomWidth }),
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/general/scale-pages", "sample.pdf"),
  ),
  play: async (context) => {
    await pickPageSize("A4")(context);
    await runToResults(context);
  },
};
