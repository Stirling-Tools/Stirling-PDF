import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import {
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findEnabled,
  openSelect,
  openStep,
  openTooltip,
  type PlayContext,
  runToResults,
  type TooltipTrigger,
  typeInto,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add Page Numbers/Panel",
  ...toolPanelMeta("addPageNumbers"),
};
export default meta;

type Story = StoryObj<typeof meta>;

async function openCustomize(context: PlayContext) {
  await openStep(context, "Customize Appearance");
  await findEnabled(context, "textbox", "Font Size");
}

async function openCustomizeSelect(context: PlayContext, label: string) {
  await openCustomize(context);
  return openSelect(context, label);
}

/** Each field's tooltip hangs on its input, not on its label. */
function fieldTooltip(label: string | RegExp): TooltipTrigger {
  return { element: (context) => findEnabled(context, "textbox", label) };
}

/** The label spells "Zero-pad" with a non-breaking hyphen. */
const ZERO_PAD = /^Zero.pad Width \(Bates Stamping\)$/;

export const Panel: Story = {};

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const PositionChosen: Story = {
  play: async (context) => {
    await userEvent.click(await findEnabled(context, "button", "1"));
  },
};

export const PagesAndStartingNumber: Story = {
  args: { files: ["multi-page-sample.pdf"] },
  play: async (context) => {
    await typeInto(context, "Pages to Number", "2,4-5");
    await typeInto(context, "Starting Number", "10");
  },
};

export const CustomizeAppearance: Story = {
  play: openCustomize,
};

export const MarginSizeMenu: Story = {
  play: async (context) => {
    const options = await openCustomizeSelect(context, "Margin Size");
    await expect(options.getAllByRole("option")).toHaveLength(4);
  },
};

export const FontNameMenu: Story = {
  play: async (context) => {
    const options = await openCustomizeSelect(context, "Font Name");
    await expect(options.getAllByRole("option")).toHaveLength(3);
  },
};

export const CustomTextFormat: Story = {
  play: async (context) => {
    await openCustomize(context);
    await typeInto(context, "Font Size", "18");
    await typeInto(context, ZERO_PAD, "3");
    await typeInto(context, "Custom Text Format", "Page {{n}");
  },
};

export const InvalidFontSizeTooltip: Story = {
  play: openTooltip(
    { runButton: true },
    {
      after: async (context) => {
        await openCustomize(context);
        await typeInto(context, "Font Size", "0");
      },
    },
  ),
};

export const PagesToNumberTooltip: Story = {
  play: openTooltip(fieldTooltip("Pages to Number")),
};

export const StartingNumberTooltip: Story = {
  play: openTooltip(fieldTooltip("Starting Number")),
};

export const MarginSizeTooltip: Story = {
  play: openTooltip(fieldTooltip("Margin Size"), { after: openCustomize }),
};

export const FontSizeTooltip: Story = {
  play: openTooltip(fieldTooltip("Font Size"), { after: openCustomize }),
};

export const ZeroPadWidthTooltip: Story = {
  play: openTooltip(fieldTooltip(ZERO_PAD), {
    after: openCustomize,
  }),
};

export const FontNameTooltip: Story = {
  play: openTooltip(fieldTooltip("Font Name"), { after: openCustomize }),
};

export const CustomTextFormatTooltip: Story = {
  play: openTooltip(fieldTooltip("Custom Text Format"), {
    after: openCustomize,
  }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/misc/add-page-numbers", "sample.pdf"),
  ),
  play: runToResults,
};
