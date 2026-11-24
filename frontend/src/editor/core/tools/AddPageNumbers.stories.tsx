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
  typeInto,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add Page Numbers/Panel",
  ...toolPanelMeta("addPageNumbers"),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** A field's accessible name also carries its (i)'s text, so match the label as a prefix. */
const PAGES_TO_NUMBER = /^Pages to Number/;
const STARTING_NUMBER = /^Starting Number/;
const MARGIN = /^Margin/;
const FONT_SIZE = /^Font Size/;
const ZERO_PAD = /^Zero-pad Width/;
const FONT_NAME = /^Font Name/;
const CUSTOM_TEXT_FORMAT = /^Custom Text Format/;

async function openCustomize(context: PlayContext) {
  await openStep(context, "Appearance");
  await findEnabled(context, "textbox", FONT_SIZE);
}

async function openCustomizeSelect(context: PlayContext, label: RegExp) {
  await openCustomize(context);
  return openSelect(context, label);
}

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
    await typeInto(context, PAGES_TO_NUMBER, "2,4-5");
    await typeInto(context, STARTING_NUMBER, "10");
  },
};

export const CustomizeAppearance: Story = {
  play: openCustomize,
};

export const MarginSizeMenu: Story = {
  play: async (context) => {
    const options = await openCustomizeSelect(context, MARGIN);
    await expect(options.getAllByRole("option")).toHaveLength(4);
  },
};

export const FontNameMenu: Story = {
  play: async (context) => {
    const options = await openCustomizeSelect(context, FONT_NAME);
    await expect(options.getAllByRole("option")).toHaveLength(3);
  },
};

export const CustomTextFormat: Story = {
  play: async (context) => {
    await openCustomize(context);
    await typeInto(context, FONT_SIZE, "18");
    await typeInto(context, ZERO_PAD, "3");
    await typeInto(context, CUSTOM_TEXT_FORMAT, "Page {{n}");
  },
};

export const InvalidFontSizeTooltip: Story = {
  play: openTooltip(
    { runButton: true },
    {
      after: async (context) => {
        await openCustomize(context);
        await typeInto(context, FONT_SIZE, "0");
      },
    },
  ),
};

export const PagesToNumberTooltip: Story = {
  play: openTooltip({ info: /^Comma-separated page numbers or ranges/ }),
};

export const StartingNumberTooltip: Story = {
  play: openTooltip({ info: /^The first number to display/ }),
};

export const MarginSizeTooltip: Story = {
  play: openTooltip(
    { info: /^Distance between the page number/ },
    { after: openCustomize },
  ),
};

export const FontSizeTooltip: Story = {
  play: openTooltip(
    { info: /^Size of the page number text/ },
    { after: openCustomize },
  ),
};

export const ZeroPadWidthTooltip: Story = {
  play: openTooltip(
    { info: /\(Bates Stamp\) page numbers/ },
    { after: openCustomize },
  ),
};

export const CustomTextFormatTooltip: Story = {
  play: openTooltip(
    { info: /^Optional custom format for page numbers/ },
    { after: openCustomize },
  ),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/misc/add-page-numbers", "sample.pdf"),
  ),
  play: runToResults,
};
