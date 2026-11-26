import type { StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  findEnabled,
  openMenu,
  openTooltip,
  panelOf,
  type PlayContext,
  STAGE_TIMEOUT,
  toggle,
  uploadToPanel,
  waitForPanelText,
  waitForToolPanel,
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

const REPLACE_EXISTING = /^Replace existing bookmarks/;

function extractedBookmarks(bookmarks: BookmarkPayload[]) {
  return http.post(EXTRACT_ENDPOINT, () => HttpResponse.json(bookmarks));
}

const withOutline = toolPanelServer(extractedBookmarks(OUTLINE));

/** Export unlocks once the extracted outline is in the editor. */
const waitForOutline = (context: PlayContext) =>
  findEnabled(context, "button", "Export");

const openActionMenu = async (context: PlayContext, trigger: string) =>
  within(await openMenu(context, trigger));

const openImportMenu = (context: PlayContext) =>
  openActionMenu(context, "Import");

// The open menu holds a focusable div that is not a menuitem.
const menuA11yIssue = knownA11yIssues("aria-required-children");

export const Panel: Story = {
  parameters: withOutline,
  play: async (context) => {
    await waitForOutline(context);
    const panel = await panelOf(context);
    await expect(
      panel.getByText("Loaded from multi-page-sample.pdf"),
    ).toBeVisible();
    await expect(
      panel.getByRole("checkbox", { name: REPLACE_EXISTING }),
    ).toBeChecked();
  },
};

export const LoadingBookmarks: Story = {
  parameters: {
    ...toolPanelServer(
      http.post(EXTRACT_ENDPOINT, async () => {
        await delay("infinite");
        return HttpResponse.json([]);
      }),
    ),
    ...menuA11yIssue,
  },
  play: async (context) => {
    const panel = within(await waitForToolPanel(context));
    const importButton = await panel.findByRole(
      "button",
      { name: "Import" },
      STAGE_TIMEOUT,
    );
    await waitFor(
      () => expect(importButton).toHaveAttribute("aria-busy", "true"),
      STAGE_TIMEOUT,
    );
    await userEvent.click(importButton);
    const menu = within(context.canvasElement.ownerDocument.body);
    await expect(
      await menu.findByRole("menuitem", { name: /Load from selected PDF/ }),
    ).toBeDisabled();
    await expect(
      menu.getByRole("menuitem", { name: /Import JSON/ }),
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
    await expect(panel.getByRole("button", { name: "Export" })).toBeDisabled();
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
    await findEnabled(context, "button", "Select PDF");
    const panel = await panelOf(context);
    await expect(panel.getByRole("button", { name: "Export" })).toBeDisabled();
  },
};

export const NoFileImportMenu: Story = {
  args: { files: [] },
  parameters: menuA11yIssue,
  play: async (context) => {
    const menu = await openImportMenu(context);
    await expect(
      menu.getByRole("menuitem", { name: /^Load from selected PDF/ }),
    ).toHaveAttribute("data-disabled");
    await expect(
      menu.getByText("Select a PDF to extract existing bookmarks."),
    ).toBeVisible();
  },
};

export const ImportMenu: Story = {
  parameters: { ...withOutline, ...menuA11yIssue },
  play: async (context) => {
    await waitForOutline(context);
    const menu = await openImportMenu(context);
    for (const item of [
      "Load from selected PDF",
      "Import JSON",
      "Paste JSON from clipboard",
    ])
      await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  },
};

export const ExportMenu: Story = {
  parameters: { ...withOutline, ...menuA11yIssue },
  play: async (context) => {
    await waitForOutline(context);
    const menu = await openActionMenu(context, "Export");
    for (const item of ["Download JSON", "Copy JSON to clipboard"])
      await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  },
};

export const ReplaceExistingOff: Story = {
  parameters: withOutline,
  play: async (context) => {
    await waitForOutline(context);
    await toggle(context, "checkbox", REPLACE_EXISTING);
  },
};

export const LoadedFromSelectedPdf: Story = {
  parameters: withOutline,
  play: async (context) => {
    await waitForOutline(context);
    const menu = await openImportMenu(context);
    await userEvent.click(
      menu.getByRole("menuitem", { name: "Load from selected PDF" }),
    );
    await waitFor(
      () => expect(bodyOf(context).queryByRole("menu")).toBeNull(),
      STAGE_TIMEOUT,
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

export const BookmarksAndOutlineTooltip: Story = {
  parameters: withOutline,
  play: openTooltip({ step: "Bookmarks & outline" }, { after: waitForOutline }),
};

export const ReplaceExistingTooltip: Story = {
  parameters: withOutline,
  play: openTooltip(
    { info: /new outline is appended/ },
    { after: waitForOutline },
  ),
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
