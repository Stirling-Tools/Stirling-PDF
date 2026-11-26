import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  endpointUnavailable,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findEnabled,
  openSelect,
  openStep,
  openTooltip,
  type PlayContext,
  selectOption,
  STAGE_TIMEOUT,
  toggle,
  typeInto,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Split/Panel",
  ...toolPanelMeta("split", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** Each method card's name, and the title the settings step takes once it is picked. */
const METHODS = {
  pages: { card: "Page Numbers", settings: "Split at Page Numbers" },
  chapters: { card: "Chapters", settings: "Split by Chapters" },
  sections: { card: "Sections", settings: "Split by Sections" },
  size: { card: "File Size", settings: "Split by File Size" },
  pageCount: { card: "Page Count", settings: "Split by Page Count" },
  docCount: { card: "Document Count", settings: "Split by Document Count" },
  divider: { card: "Page Divider", settings: "Split by Page Divider" },
  poster: { card: "Printable Chunks", settings: "Split into Printable Chunks" },
} as const;

type Method = (typeof METHODS)[keyof typeof METHODS];

function pickMethod(method: Method) {
  return async (context: PlayContext) => {
    const panel = await waitForPanelText(context, method.card);
    // The cards drop clicks until the endpoint check settles and expose no
    // disabled state to wait on, so click until the settings step opens.
    await waitFor(async () => {
      if (!panel.queryByText(method.settings))
        await userEvent.click(panel.getByText(method.card, { exact: true }));
      await expect(panel.getByText(method.settings)).toBeVisible();
    }, STAGE_TIMEOUT);
    return panel;
  };
}

function byMethod(method: Method): Story {
  return { play: pickMethod(method) };
}

function settingsTooltip(method: Method): Story {
  return {
    play: openTooltip({ step: method.settings }, { after: pickMethod(method) }),
  };
}

function cardTooltip(method: Method): Story {
  return { play: openTooltip({ text: method.card }) };
}

export const Panel: Story = {};

export const ChooseMethodTooltip: Story = {
  play: openTooltip({ step: "Choose Method" }),
};

export const PageNumbersMethodTooltip = cardTooltip(METHODS.pages);
export const ChaptersMethodTooltip = cardTooltip(METHODS.chapters);
export const SectionsMethodTooltip = cardTooltip(METHODS.sections);
export const FileSizeMethodTooltip = cardTooltip(METHODS.size);
export const PageCountMethodTooltip = cardTooltip(METHODS.pageCount);
export const DocumentCountMethodTooltip = cardTooltip(METHODS.docCount);
export const PageDividerMethodTooltip = cardTooltip(METHODS.divider);
export const PrintableChunksMethodTooltip = cardTooltip(METHODS.poster);

export const MethodUnavailable: Story = {
  parameters: toolPanelServer(...endpointUnavailable("split-pdf-by-chapters")),
  play: async (context) => {
    const panel = await waitForPanelText(context, METHODS.pages.card);
    await expect(
      panel.queryByText(METHODS.chapters.card, { exact: true }),
    ).toBeNull();
  },
};

export const ByPageNumbers = byMethod(METHODS.pages);
export const ByChapters = byMethod(METHODS.chapters);
export const BySections = byMethod(METHODS.sections);
export const ByFileSize = byMethod(METHODS.size);
export const ByPageCount = byMethod(METHODS.pageCount);
export const ByDocumentCount = byMethod(METHODS.docCount);
export const ByPageDivider = byMethod(METHODS.divider);
export const ByPrintableChunks = byMethod(METHODS.poster);

export const ByPageNumbersTooltip = settingsTooltip(METHODS.pages);
export const ByChaptersTooltip = settingsTooltip(METHODS.chapters);
export const BySectionsTooltip = settingsTooltip(METHODS.sections);
export const ByFileSizeTooltip = settingsTooltip(METHODS.size);
export const ByPageCountTooltip = settingsTooltip(METHODS.pageCount);
export const ByDocumentCountTooltip = settingsTooltip(METHODS.docCount);
export const ByPageDividerTooltip = settingsTooltip(METHODS.divider);
export const ByPrintableChunksTooltip = settingsTooltip(METHODS.poster);

export const SettingsRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }, { after: pickMethod(METHODS.pages) }),
};

export const ByPageNumbersEntered: Story = {
  play: async (context) => {
    await pickMethod(METHODS.pages)(context);
    await typeInto(context, "Enter pages to split on:", "2,4");
    await findEnabled(context, "button", /^Split/);
  },
};

export const BySectionsSplitModes: Story = {
  play: async (context) => {
    await pickMethod(METHODS.sections)(context);
    const modes = await openSelect(context, "Split Mode");
    await expect(modes.getAllByRole("option")).toHaveLength(5);
  },
};

export const BySectionsCustomPages: Story = {
  play: async (context) => {
    await pickMethod(METHODS.sections)(context);
    const panel = await selectOption(context, "Split Mode", "Custom pages");
    await expect(
      await panel.findByRole("textbox", { name: "Custom Page Numbers" }),
    ).toBeVisible();
    await toggle(context, "checkbox", "Merge Into One PDF");
  },
};

export const ByChaptersOptionsOn: Story = {
  play: async (context) => {
    await pickMethod(METHODS.chapters)(context);
    for (const name of ["Include Metadata", "Allow Duplicates"])
      await toggle(context, "checkbox", name);
  },
};

export const ByPageDividerDuplex: Story = {
  play: async (context) => {
    const panel = await pickMethod(METHODS.divider)(context);
    await expect(
      panel.getByRole("link", { name: /Auto Splitter Divider/ }),
    ).toBeVisible();
    await toggle(context, "checkbox", "Duplex mode");
  },
};

export const ByPrintableChunksPageSizes: Story = {
  play: async (context) => {
    await pickMethod(METHODS.poster)(context);
    const sizes = await openSelect(context, "Target Page Size");
    await expect(sizes.getAllByRole("option")).toHaveLength(6);
  },
};

export const ByPrintableChunksRightToLeft: Story = {
  play: async (context) => {
    await pickMethod(METHODS.poster)(context);
    await toggle(context, "checkbox", "Split right-to-left");
  },
};

export const ChangeMethod: Story = {
  play: async (context) => {
    await pickMethod(METHODS.pages)(context);
    const panel = await openStep(context, "Choose Method");
    await waitForPanelText(context, METHODS.poster.card);
    await expect(panel.getByText("Settings", { exact: true })).toBeVisible();
  },
};
