import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import {
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openMenu,
  openTooltip,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type { BookmarkPayload } from "@editor/utils/editTableOfContents";

const meta = {
  title: "Tools/Edit Table of Contents/Panel",
  ...toolPanelMeta("editTableOfContents", {
    files: ["multi-page-sample.pdf"],
  }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const OUTLINE: BookmarkPayload[] = [
  {
    title: "Introduction",
    pageNumber: 1,
    children: [{ title: "Scope", pageNumber: 2 }],
  },
  { title: "Results", pageNumber: 3 },
];

function extractedBookmarks(bookmarks: BookmarkPayload[]) {
  return toolPanelServer(
    http.post("*/api/v1/general/extract-bookmarks", () =>
      HttpResponse.json(bookmarks),
    ),
  );
}

export const Panel: Story = {
  parameters: extractedBookmarks(OUTLINE),
};

export const NoBookmarks: Story = {
  parameters: extractedBookmarks([]),
};

export const ImportMenu: Story = {
  parameters: extractedBookmarks(OUTLINE),
  play: async (context) => {
    await openMenu(context, "Import");
  },
};

export const ExportMenu: Story = {
  parameters: extractedBookmarks(OUTLINE),
  play: async (context) => {
    await openMenu(context, "Export");
  },
};

export const BookmarksAndOutlineTooltip: Story = {
  parameters: extractedBookmarks(OUTLINE),
  play: openTooltip({ step: "Bookmarks & outline" }),
};

export const ReplaceExistingTooltip: Story = {
  parameters: extractedBookmarks(OUTLINE),
  play: openTooltip({ info: /new outline is appended/ }),
};
