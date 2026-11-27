import type { StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import type { AttachmentInfo } from "@editor/services/attachmentService";
import { loadFixture } from "@editor/components/tools/toolPanelStory/fixtures";
import {
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  panelOf,
  type PanelQueries,
  type PlayContext,
  STAGE_TIMEOUT,
  toggle,
  uploadToPanel,
  waitForPanelText,
  waitForToolPanel,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Manage Attachments/Panel",
  ...toolPanelMeta("addAttachments"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const LIST_ENDPOINT = "*/api/v1/misc/list-attachments";

const INVOICE: AttachmentInfo = {
  filename: "invoice-2024-03.pdf",
  size: 184_320,
  contentType: "application/pdf",
};

const LINE_ITEMS: AttachmentInfo = {
  filename: "line-items.csv",
  size: 4_096,
  contentType: "text/csv",
};

const SEVERAL_ATTACHMENTS: AttachmentInfo[] = [
  INVOICE,
  LINE_ITEMS,
  { filename: "signature.png", size: 52_480, contentType: "image/png" },
  {
    filename: "terms-and-conditions.docx",
    size: 31_744,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
];

const RENAMED = "line-items-final.csv";

function listing(attachments: AttachmentInfo[]) {
  return http.post(LIST_ENDPOINT, () => HttpResponse.json(attachments));
}

function attachmentsInDocument(attachments: AttachmentInfo[]) {
  return toolPanelServer(listing(attachments));
}

async function findListed(context: PlayContext): Promise<PanelQueries> {
  const panel = await panelOf(context);
  await panel.findByText(INVOICE.filename, undefined, STAGE_TIMEOUT);
  return panel;
}

const findEmptyList = (context: PlayContext) =>
  waitForPanelText(
    context,
    "No attachments inside this PDF yet. Drop files below or click to browse.",
  );

async function startRename(panel: PanelQueries, index = 0) {
  await userEvent.click(
    panel.getAllByRole("button", { name: "Rename attachment" })[index],
  );
}

async function stagePendingChanges(context: PlayContext) {
  const panel = await findListed(context);
  await uploadToPanel(context, "sample.png");
  await panel.findByText("STAGED", undefined, STAGE_TIMEOUT);
  await userEvent.click(
    panel.getAllByRole("button", { name: "Remove attachment" })[0],
  );
  await startRename(panel);
  const nameInput = panel.getByDisplayValue(LINE_ITEMS.filename);
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, `${RENAMED}{Enter}`);
  await panel.findByRole(
    "button",
    { name: /Save Changes \(3\)/ },
    STAGE_TIMEOUT,
  );
  return panel;
}

export const Panel: Story = {
  parameters: attachmentsInDocument([]),
  play: async (context) => {
    await findEmptyList(context);
  },
};

export const LoadingAttachments: Story = {
  parameters: toolPanelServer(
    http.post(LIST_ENDPOINT, async () => {
      await delay("infinite");
      return HttpResponse.json([]);
    }),
  ),
  play: async (context) => {
    const panel = await waitForToolPanel(context);
    await waitFor(
      () =>
        expect(panel.querySelector(".mantine-Skeleton-root")).not.toBeNull(),
      STAGE_TIMEOUT,
    );
  },
};

export const ListingFailed: Story = {
  parameters: toolPanelServer(
    http.post(LIST_ENDPOINT, () =>
      HttpResponse.json({ error: "unreadable" }, { status: 500 }),
    ),
  ),
  play: async (context) => {
    await findEmptyList(context);
  },
};

export const WithAttachments: Story = {
  parameters: attachmentsInDocument(SEVERAL_ATTACHMENTS),
  play: async (context) => {
    const panel = await findListed(context);
    await expect(
      panel.getByPlaceholderText("Filter attachments..."),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Extract all" }),
    ).toBeVisible();
  },
};

export const FilteredAttachments: Story = {
  parameters: attachmentsInDocument(SEVERAL_ATTACHMENTS),
  play: async (context) => {
    const panel = await findListed(context);
    await userEvent.type(
      panel.getByPlaceholderText("Filter attachments..."),
      "invoice",
    );
    await panel.findByRole("button", { name: "Cancel" });
    await waitFor(() =>
      expect(panel.queryByText(LINE_ITEMS.filename)).not.toBeInTheDocument(),
    );
  },
};

export const PendingChanges: Story = {
  parameters: attachmentsInDocument(SEVERAL_ATTACHMENTS.slice(0, 2)),
  play: async (context) => {
    const panel = await stagePendingChanges(context);
    for (const badge of ["DELETED", "RENAMED"])
      await expect(panel.getByText(badge)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Discard" })).toBeVisible();
  },
};

/** What stagePendingChanges leaves once saved: the invoice gone, the rename and the new image kept. */
const AFTER_SAVE: AttachmentInfo[] = [
  { ...LINE_ITEMS, filename: RENAMED },
  { filename: "sample.png", size: 1_024, contentType: "image/png" },
];

let attachmentsSaved = false;

export const SavedChanges: Story = {
  beforeEach: () => {
    attachmentsSaved = false;
  },
  parameters: toolPanelServer(
    http.post(LIST_ENDPOINT, () =>
      HttpResponse.json(
        attachmentsSaved ? AFTER_SAVE : SEVERAL_ATTACHMENTS.slice(0, 2),
      ),
    ),
    http.post("*/api/v1/misc/batch-process-attachments", async () => {
      attachmentsSaved = true;
      return new HttpResponse(await loadFixture("sample.pdf"), {
        headers: { "Content-Type": "application/pdf" },
      });
    }),
  ),
  play: async (context) => {
    const panel = await stagePendingChanges(context);
    await userEvent.click(
      panel.getByRole("button", { name: /Save Changes \(3\)/ }),
    );
    await waitFor(
      () => expect(panel.queryByText(INVOICE.filename)).not.toBeInTheDocument(),
      STAGE_TIMEOUT,
    );
    await expect(panel.getByText(RENAMED)).toBeVisible();
    await expect(panel.getByText("sample.png")).toBeVisible();
    await expect(
      panel.queryByRole("button", { name: /Save Changes/ }),
    ).not.toBeInTheDocument();
  },
};

export const RenamingAttachment: Story = {
  // The inline rename field has no label (AttachmentRow's TextInput).
  parameters: {
    ...attachmentsInDocument([INVOICE]),
    ...knownA11yIssues("label"),
  },
  play: async (context) => {
    const panel = await findListed(context);
    await startRename(panel);
    await expect(panel.getByDisplayValue(INVOICE.filename)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Cancel" })).toBeVisible();
  },
};

export const ConvertToPdfA3b: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: async (context) => {
    await findListed(context);
    await toggle(context, "checkbox", /Convert to PDF\/A-3b/);
  },
};

export const ConvertToPdfA3bTooltip: Story = {
  parameters: attachmentsInDocument([]),
  play: openTooltip(
    { info: /^PDF\/A-3b is an archival format/ },
    { after: findEmptyList },
  ),
};

export const NoFiles: Story = {
  args: { files: [] },
  parameters: attachmentsInDocument([]),
};

export const SelectAttachmentsTooltip: Story = {
  parameters: attachmentsInDocument([]),
  play: openTooltip({ step: "Select Attachments" }, { after: findEmptyList }),
};

export const AttachmentNameTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip({ text: INVOICE.filename }),
};

export const RenamedAttachmentNameTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip(
    { text: RENAMED },
    {
      after: async (context) => {
        const panel = await findListed(context);
        await startRename(panel);
        const nameInput = panel.getByDisplayValue(INVOICE.filename);
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, `${RENAMED}{Enter}`);
        await panel.findByText("RENAMED");
      },
    },
  ),
};

export const DownloadAttachmentTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip({ info: "Download attachment" }, { after: findListed }),
};

export const RenameAttachmentTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip({ info: "Rename attachment" }, { after: findListed }),
};

export const RemoveAttachmentTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip({ info: "Remove attachment" }, { after: findListed }),
};

export const UndoDeleteTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip(
    { info: "Undo delete" },
    {
      after: async (context) => {
        const panel = await findListed(context);
        await userEvent.click(
          panel.getByRole("button", { name: "Remove attachment" }),
        );
      },
    },
  ),
};
