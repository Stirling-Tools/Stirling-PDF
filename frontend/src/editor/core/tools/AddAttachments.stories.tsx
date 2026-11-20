import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, within } from "storybook/test";
import type { AttachmentInfo } from "@editor/services/attachmentService";
import {
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  STAGE_TIMEOUT,
  waitForToolPanel,
  type PlayContext,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { loadFixture } from "@editor/components/tools/toolPanelStory/fixtures";

const meta = {
  title: "Tools/Manage Attachments/Panel",
  ...toolPanelMeta("addAttachments"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const INVOICE: AttachmentInfo = {
  filename: "invoice-2024-03.pdf",
  size: 184_320,
  contentType: "application/pdf",
};

const SEVERAL_ATTACHMENTS: AttachmentInfo[] = [
  INVOICE,
  { filename: "line-items.csv", size: 4_096, contentType: "text/csv" },
  { filename: "signature.png", size: 52_480, contentType: "image/png" },
  {
    filename: "terms-and-conditions.docx",
    size: 31_744,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
];

function attachmentsInDocument(attachments: AttachmentInfo[]) {
  return toolPanelServer(
    http.post("/api/v1/misc/list-attachments", () =>
      HttpResponse.json(attachments),
    ),
  );
}

async function findPanel(context: PlayContext) {
  const panel = within(await waitForToolPanel(context));
  await panel.findByText(INVOICE.filename, undefined, STAGE_TIMEOUT);
  return panel;
}

export const Panel: Story = {
  parameters: attachmentsInDocument([]),
};

export const WithAttachments: Story = {
  parameters: attachmentsInDocument(SEVERAL_ATTACHMENTS),
  play: async (context) => {
    await findPanel(context);
  },
};

export const FilteredAttachments: Story = {
  parameters: attachmentsInDocument(SEVERAL_ATTACHMENTS),
  play: async (context) => {
    const panel = await findPanel(context);
    await userEvent.type(
      panel.getByPlaceholderText("Filter attachments..."),
      "invoice",
    );
    await panel.findByRole("button", { name: "Cancel" });
  },
};

export const PendingChanges: Story = {
  parameters: attachmentsInDocument(SEVERAL_ATTACHMENTS.slice(0, 2)),
  play: async (context) => {
    const panel = await findPanel(context);
    const input =
      context.canvasElement.ownerDocument.querySelector<HTMLInputElement>(
        "#attachments-input",
      );
    await userEvent.upload(input!, await loadFixture("sample.png"));
    await userEvent.click(
      panel.getAllByRole("button", { name: "Remove attachment" })[0],
    );
    await userEvent.click(
      panel.getAllByRole("button", { name: "Rename attachment" })[0],
    );
    const nameInput = panel.getByRole("textbox", {
      name: "Rename attachment",
    });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "line-items-final.csv{Enter}");
    await panel.findByRole("button", { name: /Save Changes \(3\)/ });
  },
};

export const RenamingAttachment: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: async (context) => {
    const panel = await findPanel(context);
    await userEvent.click(
      panel.getByRole("button", { name: "Rename attachment" }),
    );
    await expect(
      panel.getByRole("textbox", { name: "Rename attachment" }),
    ).toHaveValue(INVOICE.filename);
  },
};

export const SelectAttachmentsTooltip: Story = {
  parameters: attachmentsInDocument([]),
  play: openTooltip({ step: "Select Attachments" }),
};

export const ConvertToPdfA3bTooltip: Story = {
  parameters: attachmentsInDocument([]),
  play: openTooltip({ info: /^PDF\/A-3b is an archival format/ }),
};

export const AttachmentNameTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip({ text: INVOICE.filename }),
};

export const DownloadAttachmentTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip({ info: "Download attachment" }),
};

export const RenameAttachmentTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip({ info: "Rename attachment" }),
};

export const RemoveAttachmentTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: openTooltip({ info: "Remove attachment" }),
};

export const UndoDeleteTooltip: Story = {
  parameters: attachmentsInDocument([INVOICE]),
  play: async (context) => {
    const panel = await findPanel(context);
    await userEvent.click(
      panel.getByRole("button", { name: "Remove attachment" }),
    );
    await openTooltip({ info: "Undo delete" })(context);
  },
};
