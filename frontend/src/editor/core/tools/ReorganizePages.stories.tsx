import type { StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  findEnabled,
  findInfoButton,
  openSelect,
  openTooltip,
  type PlayContext,
  runToResults,
  selectOption,
  typeInto,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Reorganize Pages/Panel",
  ...toolPanelMeta("reorganizePages", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** A labelled field's accessible name also carries its (i)'s text, so names match on their start. */
const PAGE_ORDER = /^Page Order/;

const MODE = /^Organization mode/;

/** Resolves once the mode's (i) carries the picked mode's description. */
function pickMode(mode: string, description: string | RegExp) {
  return async (context: PlayContext) => {
    const panel = await selectOption(context, MODE, mode);
    await expect(await findInfoButton(panel, description)).toBeInTheDocument();
    return panel;
  };
}

function presetMode(mode: string, description: string | RegExp): Story {
  return {
    play: async (context) => {
      const panel = await pickMode(mode, description)(context);
      await expect(panel.queryByRole("textbox", { name: PAGE_ORDER })).toBe(
        null,
      );
    },
  };
}

function modeTooltip(mode: string, description: string | RegExp): Story {
  return {
    play: openTooltip(
      { info: description },
      { after: pickMode(mode, description) },
    ),
  };
}

const DESCRIPTIONS = {
  custom: /^Use a custom sequence of page numbers/,
  reverse: /^Flip the document so the last page/,
  duplex: /^Interleave fronts/,
  booklet: /^Arrange pages for booklet printing/,
  sideStitch: /^Arrange pages for side.stitch booklet/,
  oddEvenSplit: /all odd pages first, then all even pages/,
  oddEvenMerge: /^Interleave the pages of the first and second half/,
  duplicate: /^Duplicate each page according to the custom order count/,
  removeFirst: "Remove the first page from the document.",
  removeLast: "Remove the last page from the document.",
  removeFirstAndLast: "Remove both the first and last pages from the document.",
} as const;

export const Panel: Story = {};

export const ModeOptions: Story = {
  // The mode listbox scrolls but cannot take keyboard focus.
  parameters: knownA11yIssues("scrollable-region-focusable"),
  play: async (context) => {
    const modes = await openSelect(context, MODE);
    await expect(modes.getAllByRole("option")).toHaveLength(11);
  },
};

export const OrganizationModeTooltip: Story = {
  play: openTooltip({ info: DESCRIPTIONS.custom }),
};

export const PageOrderTooltip: Story = {
  play: openTooltip({ info: /^A comma-separated list of page numbers/ }),
};

export const CustomPageOrderEntered: Story = {
  play: async (context) => {
    await typeInto(context, PAGE_ORDER, "3,1,2,4-6");
    await findEnabled(context, "button", /^Reorganize Pages/);
  },
};

export const PageOrderRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};

export const ReverseOrder = presetMode("Reverse Order", DESCRIPTIONS.reverse);
export const DuplexSort = presetMode("Duplex Sort", DESCRIPTIONS.duplex);
export const BookletSort = presetMode("Booklet Sort", DESCRIPTIONS.booklet);
export const SideStitchBookletSort = presetMode(
  "Side Stitch Booklet Sort",
  DESCRIPTIONS.sideStitch,
);
export const OddEvenSplit = presetMode(
  "Odd-Even Split",
  DESCRIPTIONS.oddEvenSplit,
);
export const OddEvenMerge = presetMode(
  "Odd-Even Merge",
  DESCRIPTIONS.oddEvenMerge,
);
export const RemoveFirst = presetMode("Remove First", DESCRIPTIONS.removeFirst);
export const RemoveLast = presetMode("Remove Last", DESCRIPTIONS.removeLast);
export const RemoveFirstAndLast = presetMode(
  "Remove First and Last",
  DESCRIPTIONS.removeFirstAndLast,
);

export const DuplicateAllPages: Story = {
  play: async (context) => {
    const panel = await pickMode(
      "Duplicate all pages",
      DESCRIPTIONS.duplicate,
    )(context);
    await expect(
      panel.getByRole("textbox", { name: PAGE_ORDER }),
    ).toBeVisible();
  },
};

export const ReverseOrderTooltip = modeTooltip(
  "Reverse Order",
  DESCRIPTIONS.reverse,
);
export const DuplexSortTooltip = modeTooltip(
  "Duplex Sort",
  DESCRIPTIONS.duplex,
);
export const BookletSortTooltip = modeTooltip(
  "Booklet Sort",
  DESCRIPTIONS.booklet,
);
export const SideStitchBookletSortTooltip = modeTooltip(
  "Side Stitch Booklet Sort",
  DESCRIPTIONS.sideStitch,
);
export const OddEvenSplitTooltip = modeTooltip(
  "Odd-Even Split",
  DESCRIPTIONS.oddEvenSplit,
);
export const OddEvenMergeTooltip = modeTooltip(
  "Odd-Even Merge",
  DESCRIPTIONS.oddEvenMerge,
);
export const RemoveFirstTooltip = modeTooltip(
  "Remove First",
  DESCRIPTIONS.removeFirst,
);
export const RemoveLastTooltip = modeTooltip(
  "Remove Last",
  DESCRIPTIONS.removeLast,
);
export const RemoveFirstAndLastTooltip = modeTooltip(
  "Remove First and Last",
  DESCRIPTIONS.removeFirstAndLast,
);
export const DuplicateAllPagesTooltip = modeTooltip(
  "Duplicate all pages",
  DESCRIPTIONS.duplicate,
);

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/general/rearrange-pages", "sample.pdf"),
  ),
  play: async (context) => {
    await pickMode("Reverse Order", DESCRIPTIONS.reverse)(context);
    await runToResults(context);
  },
};
