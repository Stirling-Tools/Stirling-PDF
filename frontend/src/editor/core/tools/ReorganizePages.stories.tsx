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

const PAGE_ORDER = /^Custom Page Order \(Enter a comma-separated list/;

const MODE = "Organization mode";

/** Resolves once the picked mode's description shows. */
function pickMode(mode: string, description: string | RegExp) {
  return async (context: PlayContext) => {
    const panel = await selectOption(context, MODE, mode);
    await expect(await panel.findByText(description)).toBeVisible();
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

export const Panel: Story = {};

export const ModeOptions: Story = {
  // The mode listbox scrolls but cannot take keyboard focus.
  parameters: knownA11yIssues("scrollable-region-focusable"),
  play: async (context) => {
    const modes = await openSelect(context, MODE);
    await expect(modes.getAllByRole("option")).toHaveLength(11);
  },
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

export const ReverseOrder = presetMode(
  "Reverse Order",
  /^Flip the document so the last page/,
);

export const DuplexSort = presetMode("Duplex Sort", /^Interleave fronts/);

export const BookletSort = presetMode(
  "Booklet Sort",
  /^Arrange pages for booklet printing/,
);

export const SideStitchBookletSort = presetMode(
  "Side Stitch Booklet Sort",
  /^Arrange pages for side.stitch booklet/,
);

export const OddEvenSplit = presetMode(
  "Odd-Even Split",
  /all odd pages first, then all even pages/,
);

export const OddEvenMerge = presetMode(
  "Odd-Even Merge",
  /^Interleave the pages of the first and second half/,
);

export const RemoveFirst = presetMode(
  "Remove First",
  "Remove the first page from the document.",
);

export const RemoveLast = presetMode(
  "Remove Last",
  "Remove the last page from the document.",
);

export const RemoveFirstAndLast = presetMode(
  "Remove First and Last",
  "Remove both the first and last pages from the document.",
);

export const DuplicateAllPages: Story = {
  play: async (context) => {
    const panel = await pickMode(
      "Duplicate all pages",
      /^Duplicate each page according to the custom order count/,
    )(context);
    await expect(
      panel.getByRole("textbox", { name: PAGE_ORDER }),
    ).toBeVisible();
  },
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/general/rearrange-pages", "sample.pdf"),
  ),
  play: async (context) => {
    await pickMode("Reverse Order", /^Flip the document/)(context);
    await runToResults(context);
  },
};
