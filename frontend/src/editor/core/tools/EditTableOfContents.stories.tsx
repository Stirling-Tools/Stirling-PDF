import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  findEnabled,
  openTooltip,
  panelOf,
  type PlayContext,
  STAGE_TIMEOUT,
  toggle,
  uploadToPanel,
  waitForPanelText,
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

const EXTRACT_ENDPOINT = "*/api/v1/general/extract-bookmarks";

const OUTLINE: BookmarkPayload[] = [
  {
    title: "Introduction",
    pageNumber: 1,
    children: [{ title: "Scope", pageNumber: 2 }],
  },
  { title: "Results", pageNumber: 3 },
];

function extractedBookmarks(bookmarks: BookmarkPayload[]) {
  return http.post(EXTRACT_ENDPOINT, () => HttpResponse.json(bookmarks));
}

const withOutline = toolPanelServer(extractedBookmarks(OUTLINE));

/** Export unlocks once the extracted outline is in the editor. */
const waitForOutline = (context: PlayContext) =>
  findEnabled(context, "button", "Download JSON");

export const Panel: Story = {
  parameters: withOutline,
  play: async (context) => {
    await waitForOutline(context);
    await expect(
      (await panelOf(context)).getByRole("button", {
        name: "Copy JSON to clipboard",
      }),
    ).toBeEnabled();
  },
};

export const NoBookmarks: Story = {
  parameters: toolPanelServer(extractedBookmarks([])),
  play: async (context) => {
    const panel = await waitForPanelText(
      context,
      "No bookmarks were found in the selected PDF.",
    );
    await expect(
      panel.getByRole("button", { name: "Download JSON" }),
    ).toBeDisabled();
  },
};

export const ExtractionFailed: Story = {
  parameters: toolPanelServer(
    http.post(EXTRACT_ENDPOINT, () =>
      HttpResponse.json({ error: "unreadable" }, { status: 500 }),
    ),
  ),
  play: async (context) => {
    await waitForPanelText(
      context,
      "Unable to extract bookmarks from the selected PDF.",
    );
  },
};

export const NoFile: Story = {
  args: { files: [] },
  play: async (context) => {
    const panel = await waitForPanelText(
      context,
      "Select a PDF to extract existing bookmarks.",
    );
    await expect(
      panel.getByRole("button", { name: "Select PDF" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Load from selected PDF" }),
    ).toBeDisabled();
  },
};

export const ReplaceExistingOff: Story = {
  parameters: withOutline,
  play: async (context) => {
    await waitForOutline(context);
    await expect(
      await findEnabled(context, "switch", /^Replace existing bookmarks/),
    ).toBeChecked();
    await toggle(context, "switch", /^Replace existing bookmarks/);
  },
};

export const LoadedFromSelectedPdf: Story = {
  parameters: withOutline,
  play: async (context) => {
    await waitForOutline(context);
    await userEvent.click(
      await findEnabled(context, "button", "Load from selected PDF"),
    );
    await bodyOf(context).findByText(
      "Bookmarks extracted",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

async function importJson(context: PlayContext, contents: string) {
  await uploadToPanel(
    context,
    new File([contents], "outline.json", { type: "application/json" }),
  );
}

export const ImportedJson: Story = {
  parameters: toolPanelServer(extractedBookmarks([])),
  play: async (context) => {
    await waitForPanelText(
      context,
      "No bookmarks were found in the selected PDF.",
    );
    await importJson(context, JSON.stringify(OUTLINE));
    await bodyOf(context).findByText(
      "Bookmarks imported",
      undefined,
      STAGE_TIMEOUT,
    );
    await waitForOutline(context);
  },
};

export const ImportedInvalidJson: Story = {
  parameters: withOutline,
  play: async (context) => {
    await waitForOutline(context);
    await importJson(context, "not an outline");
    await bodyOf(context).findByText(
      "Invalid JSON structure",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const LoadFromSelectedPdfTooltip: Story = {
  args: { files: [] },
  play: openTooltip({
    element: async (context) =>
      (await panelOf(context)).findByRole(
        "button",
        { name: "Load from selected PDF" },
        STAGE_TIMEOUT,
      ),
  }),
};

export const Results: Story = {
  args: { showWorkbench: true },
  parameters: {
    ...toolPanelServer(
      extractedBookmarks(OUTLINE),
      fixtureResponse("/api/v1/general/edit-table-of-contents", "sample.pdf"),
    ),
    // The outline workspace scrolls in a box that cannot take keyboard focus.
    ...knownA11yIssues("scrollable-region-focusable"),
  },
  play: async (context) => {
    await waitForOutline(context);
    const apply = await bodyOf(context).findByRole(
      "button",
      { name: "Apply table of contents" },
      STAGE_TIMEOUT,
    );
    await waitFor(() => expect(apply).toBeEnabled(), STAGE_TIMEOUT);
    await userEvent.click(apply);
    const panel = await panelOf(context);
    await expect(
      await panel.findByRole("button", { name: "Undo" }, STAGE_TIMEOUT),
    ).toBeVisible();
  },
};
