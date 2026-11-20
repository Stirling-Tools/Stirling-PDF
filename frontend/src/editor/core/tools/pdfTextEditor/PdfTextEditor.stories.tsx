import type { StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import {
  endpointUnavailable,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  untilPanelShows,
  STAGE_TIMEOUT,
  waitForPanelText,
  unlockEncryptedPdf,
  type PlayContext,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { __resetEditorStoreForTests } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";

const meta = {
  title: "Tools/PDF Text Editor/Panel",
  ...toolPanelMeta("pdfTextEditor"),
  // The editor keeps its document for a grace period after unmounting, so
  // without a fresh store each story would open on the previous story's file.
  beforeEach: () => {
    __resetEditorStoreForTests();
  },
  play: async (context: PlayContext) => {
    await waitForDocument(context);
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

function waitForDocument(context: PlayContext) {
  return waitForPanelText(context, "Nothing selected");
}

/**
 * Clicks one object on the editor canvas at its centre, the way a user picks
 * it; `extend` holds Shift to add it to the selection.
 */
async function clickOnPage(
  context: PlayContext,
  objectTestId: string,
  { extend = false }: { extend?: boolean } = {},
) {
  const target = await within(context.canvasElement).findByTestId(
    objectTestId,
    undefined,
    STAGE_TIMEOUT,
  );
  target.scrollIntoView({ block: "center" });
  const box = target.getBoundingClientRect();
  const coords = {
    clientX: box.left + box.width / 2,
    clientY: box.top + box.height / 2,
  };
  const user = userEvent.setup();
  if (extend) await user.keyboard("{Shift>}");
  await user.pointer({ keys: "[MouseLeft]", target, coords });
  if (extend) await user.keyboard("{/Shift}");
}

function selectOnPage(...picks: { testId: string; extend?: boolean }[]) {
  return async (context: PlayContext): Promise<void> => {
    const panel = await waitForDocument(context);
    for (const { testId, extend } of picks)
      await clickOnPage(context, testId, { extend });
    await panel.findByTestId(
      "pdf-editor-selection-inspector",
      undefined,
      STAGE_TIMEOUT,
    );
  };
}

async function openDocumentTab(context: PlayContext) {
  const panel = await waitForDocument(context);
  await userEvent.click(await panel.findByRole("tab", { name: "Document" }));
  await panel.findByTestId(
    "pdf-editor-document-panel",
    undefined,
    STAGE_TIMEOUT,
  );
  return panel;
}

async function openAdvancedSettings(context: PlayContext) {
  const panel = await openDocumentTab(context);
  await userEvent.click(await panel.findByTestId("pdf-editor-advanced-toggle"));
  await panel.findByText("Text grouping", undefined, STAGE_TIMEOUT);
  return panel;
}

const selectText = selectOnPage({ testId: "pdf-editor-run-p0-t0" });

const selectTwoTexts = selectOnPage(
  { testId: "pdf-editor-run-p0-t0" },
  { testId: "pdf-editor-run-p0-t2", extend: true },
);

const selectParagraph = selectOnPage({ testId: "pdf-editor-run-p1-t23" });

const selectImage = selectOnPage({ testId: "pdf-editor-image-p0-i46" });

const selectShape = selectOnPage({ testId: "pdf-editor-shape-p0-s7" });

const selectMixed = selectOnPage(
  { testId: "pdf-editor-image-p0-i46" },
  { testId: "pdf-editor-run-p0-t0", extend: true },
  { testId: "pdf-editor-shape-p0-s7", extend: true },
);

async function openScannedProtected(context: PlayContext) {
  await unlockEncryptedPdf(context, "scanned-no-ocr-encrypted.pdf");
  await waitForPanelText(context, "Remove Password");
}

const withCanvas = { showWorkbench: true } as const;

const paragraphFile = {
  ...withCanvas,
  files: ["multi-page-sample.pdf"],
} as const;

export const Panel: Story = {};

export const DocumentTab: Story = {
  play: openDocumentTab,
};

export const DocumentAdvancedSettings: Story = {
  play: openAdvancedSettings,
};

export const TextSelected: Story = {
  args: withCanvas,
  play: selectText,
};

export const SeveralTextsSelected: Story = {
  args: withCanvas,
  play: selectTwoTexts,
};

export const ParagraphSelected: Story = {
  args: paragraphFile,
  play: selectParagraph,
};

export const ImageSelected: Story = {
  args: withCanvas,
  play: selectImage,
};

export const ShapeSelected: Story = {
  args: withCanvas,
  play: selectShape,
};

export const MixedSelection: Story = {
  args: withCanvas,
  play: selectMixed,
};

export const ScannedPage: Story = {
  args: { files: ["scanned-no-ocr.pdf"] },
  play: untilPanelShows("Run OCR"),
};

export const ScannedPageProtected: Story = {
  args: { files: ["scanned-no-ocr-encrypted.pdf"] },
  play: openScannedProtected,
};

export const ScannedPageOcrUnavailable: Story = {
  args: { files: ["scanned-no-ocr.pdf"] },
  parameters: toolPanelServer(...endpointUnavailable("ocr-pdf")),
  play: untilPanelShows("OCR is unavailable on this server."),
};

export const SaveTooltip: Story = {
  play: openTooltip({ info: "Save PDF" }),
};

export const DownloadTooltip: Story = {
  play: openTooltip({ info: "Download" }),
};

export const FontStatusTooltip: Story = {
  play: openTooltip(
    {
      element: async ({ canvasElement }) =>
        within(canvasElement.ownerDocument.body).findByTestId(
          "pdf-editor-font-compat",
        ),
    },
    { after: openDocumentTab },
  ),
};

export const TextGroupingTooltip: Story = {
  play: openTooltip(
    {
      info: /^Groups equal-spaced lines into paragraphs/,
    },
    { after: openAdvancedSettings },
  ),
};

export const TextBoxWidthTooltip: Story = {
  play: openTooltip(
    {
      info: /^Grow widens a box as you type/,
    },
    { after: openAdvancedSettings },
  ),
};

export const TextWidthTooltip: Story = {
  args: withCanvas,
  play: openTooltip(
    { info: "Text re-wraps to fit the width." },
    { after: selectText },
  ),
};

export const TextHeightTooltip: Story = {
  args: withCanvas,
  play: openTooltip(
    {
      info: /^A text box's height follows its type size/,
    },
    { after: selectText },
  ),
};

export const GroupDisabledTooltip: Story = {
  args: withCanvas,
  play: openTooltip({ text: "Group" }, { after: selectText }),
};

export const GroupTooltip: Story = {
  args: withCanvas,
  play: openTooltip({ info: "Group" }, { after: selectTwoTexts }),
};

export const UngroupDisabledTooltip: Story = {
  args: withCanvas,
  play: openTooltip({ text: "Ungroup" }, { after: selectText }),
};

export const UngroupTooltip: Story = {
  args: paragraphFile,
  play: openTooltip({ info: "Ungroup" }, { after: selectParagraph }),
};

export const RotateLeftTooltip: Story = {
  args: withCanvas,
  play: openTooltip({ info: "Rotate 90° left" }, { after: selectImage }),
};

export const RotateRightTooltip: Story = {
  args: withCanvas,
  play: openTooltip({ info: "Rotate 90° right" }, { after: selectImage }),
};

export const FlipHorizontalTooltip: Story = {
  args: withCanvas,
  play: openTooltip({ info: "Flip horizontal" }, { after: selectImage }),
};

export const FlipVerticalTooltip: Story = {
  args: withCanvas,
  play: openTooltip({ info: "Flip vertical" }, { after: selectImage }),
};

export const RemovePasswordTooltip: Story = {
  args: { files: ["scanned-no-ocr-encrypted.pdf"] },
  play: openTooltip(
    { text: "Remove Password" },
    { after: openScannedProtected },
  ),
};
