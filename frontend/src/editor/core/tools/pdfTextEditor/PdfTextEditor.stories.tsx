import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  endpointUnavailable,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  choose,
  openSelect,
  openTooltip,
  panelOf,
  type PlayContext,
  STAGE_TIMEOUT,
  unlockEncryptedPdf,
  untilPanelShows,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { __resetEditorStoreForTests } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import {
  SPELLCHECK_AUTO,
  setSpellcheckPreference,
} from "@editor/tools/pdfTextEditor/util/spellcheck";
import type { FixtureName } from "@editor/components/tools/toolPanelStory/fixtures";

const meta = {
  title: "Tools/PDF Text Editor/Panel",
  ...toolPanelMeta("pdfTextEditor"),
  // The editor keeps its document for a grace period after unmounting, so
  // without a fresh store each story would open on the previous story's file.
  // The spell-check preference is kept in browser storage, so a story that
  // turns it off would otherwise open every later story with it off.
  beforeEach: () => {
    __resetEditorStoreForTests();
    setSpellcheckPreference({ enabled: true, lang: SPELLCHECK_AUTO });
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

/**
 * The editor's canvas beside the panel. Its chrome fails axe as the viewer's
 * does: popover targets put aria-expanded on plain divs, a slider has an empty
 * name, a number field has no label, and the scroller takes no focus.
 */
function onCanvas(files?: readonly FixtureName[]) {
  return {
    args: { showWorkbench: true, ...(files && { files }) },
    parameters: knownA11yIssues(
      "aria-allowed-attr",
      "aria-input-field-name",
      "label",
      "scrollable-region-focusable",
    ),
  } as const;
}

async function nudgeUp(context: PlayContext, label: string) {
  const panel = await panelOf(context);
  const input = panel.getByRole("textbox", { name: label });
  const before = Number.parseFloat((input as HTMLInputElement).value);
  await userEvent.click(input);
  await userEvent.keyboard("{ArrowUp}");
  await waitFor(() => expect(input).toHaveValue((before + 1).toFixed(1)));
}

export const Panel: Story = {
  play: async (context) => {
    const panel = await waitForDocument(context);
    await expect(panel.getByRole("tab", { name: "Selected" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(panel.getByRole("button", { name: "Save PDF" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Download" })).toBeVisible();
  },
};

export const NoFile: Story = {
  args: { files: [] },
  play: untilPanelShows("No file loaded"),
};

export const DocumentTab: Story = {
  // The inspector's "Missing:" font text fails contrast.
  parameters: knownA11yIssues("color-contrast"),
  play: async (context) => {
    const panel = await openDocumentTab(context);
    await expect(panel.getByText("Text boxes")).toBeVisible();
    await expect(
      panel.getAllByTestId("pdf-editor-font-missing")[0],
    ).toBeVisible();
    await expect(
      panel.getByRole("switch", { name: "Rulers and guides" }),
    ).not.toBeChecked();
  },
};

export const FontStatusTooltip: Story = {
  // The inspector's "Missing:" font text fails contrast.
  parameters: knownA11yIssues("color-contrast"),
  play: openTooltip(
    {
      element: async (context) =>
        bodyOf(context).findByTestId("pdf-editor-font-compat"),
    },
    { after: openDocumentTab },
  ),
};

export const RulersOn: Story = {
  // The inspector's "Missing:" font text fails contrast.
  parameters: knownA11yIssues("color-contrast"),
  play: async (context) => {
    const panel = await openDocumentTab(context);
    const rulers = panel.getByRole("switch", { name: "Rulers and guides" });
    await userEvent.click(rulers);
    await waitFor(() => expect(rulers).toBeChecked());
  },
};

export const SpellcheckOff: Story = {
  // The inspector's "Missing:" font text fails contrast.
  parameters: knownA11yIssues("color-contrast"),
  play: async (context) => {
    const panel = await openDocumentTab(context);
    const spellcheck = panel.getByRole("switch", {
      name: "Check spelling as you type",
    });
    await expect(spellcheck).toBeChecked();
    await userEvent.click(spellcheck);
    await waitFor(() => expect(spellcheck).not.toBeChecked());
    await expect(
      panel.getByRole("textbox", { name: "Dictionary language" }),
    ).toBeDisabled();
  },
};

export const DictionaryLanguages: Story = {
  // The "Missing:" font text fails contrast; the language listbox scrolls but
  // cannot take keyboard focus.
  parameters: knownA11yIssues("color-contrast", "scrollable-region-focusable"),
  play: async (context) => {
    const panel = await openDocumentTab(context);
    await expect(
      panel.getByRole("textbox", { name: "Dictionary language" }),
    ).toHaveValue("Automatic");
    await openSelect(context, "Dictionary language");
  },
};

export const DocumentAdvancedSettings: Story = {
  // The inspector's "Missing:" font text fails contrast.
  parameters: knownA11yIssues("color-contrast"),
  play: async (context) => {
    const panel = await openAdvancedSettings(context);
    await expect(panel.getByRole("radio", { name: "Auto" })).toBeChecked();
    await expect(panel.getByRole("radio", { name: "Grow" })).toBeChecked();
  },
};

export const TextGroupingTooltip: Story = {
  // The inspector's "Missing:" font text fails contrast.
  parameters: knownA11yIssues("color-contrast"),
  play: openTooltip(
    { info: /^Groups equal-spaced lines into paragraphs/ },
    { after: openAdvancedSettings },
  ),
};

export const TextBoxWidthTooltip: Story = {
  // The inspector's "Missing:" font text fails contrast.
  parameters: knownA11yIssues("color-contrast"),
  play: openTooltip(
    { info: /^Grow widens a box as you type/ },
    { after: openAdvancedSettings },
  ),
};

export const LineGrouping: Story = {
  // The inspector's "Missing:" font text fails contrast.
  parameters: knownA11yIssues("color-contrast"),
  play: async (context) => {
    await openAdvancedSettings(context);
    await choose(context, "Line");
  },
};

export const WrapTextBoxes: Story = {
  // The inspector's "Missing:" font text fails contrast.
  parameters: knownA11yIssues("color-contrast"),
  play: async (context) => {
    await openAdvancedSettings(context);
    await choose(context, "Wrap");
  },
};

export const TextSelected: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectText(context);
    const panel = await panelOf(context);
    await expect(panel.getByText("Position & size")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Group" })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Ungroup" })).toBeDisabled();
  },
};

export const TextNudged: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectText(context);
    await nudgeUp(context, "X");
    await nudgeUp(context, "Y");
  },
};

/** Clearing a position field to retype it commits 0 at once, moving the text to the page edge. */
export const TextPositionCleared: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectText(context);
    const panel = await panelOf(context);
    const x = panel.getByRole("textbox", { name: "X" });
    await userEvent.clear(x);
    await waitFor(() => expect(x).toHaveValue("0.0"));
  },
};

export const SeveralTextsSelected: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectTwoTexts(context);
    const panel = await panelOf(context);
    await expect(
      panel.getByText("Select a single object to edit its position and size."),
    ).toBeVisible();
    await expect(panel.getByRole("button", { name: "Group" })).toBeEnabled();
  },
};

export const ParagraphSelected: Story = {
  ...onCanvas(["multi-page-sample.pdf"]),
  play: async (context) => {
    await selectParagraph(context);
    const panel = await panelOf(context);
    await expect(panel.getByRole("button", { name: "Ungroup" })).toBeEnabled();
  },
};

export const ImageSelected: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectImage(context);
    const panel = await panelOf(context);
    await expect(
      panel.getByRole("button", { name: "Replace, keeping placement" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Edit in another app" }),
    ).toBeVisible();
  },
};

export const ShapeSelected: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectShape(context);
    const panel = await panelOf(context);
    await expect(panel.queryByText("Position & size")).toBeNull();
  },
};

export const MixedSelection: Story = {
  ...onCanvas(),
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

export const TextWidthTooltip: Story = {
  ...onCanvas(),
  play: openTooltip(
    { info: "Text re-wraps to fit the width." },
    { after: selectText },
  ),
};

export const TextHeightTooltip: Story = {
  ...onCanvas(),
  play: openTooltip(
    { info: /^A text box's height follows its type size/ },
    { after: selectText },
  ),
};

export const GroupDisabledTooltip: Story = {
  ...onCanvas(),
  play: openTooltip({ text: "Group" }, { after: selectText }),
};

export const GroupTooltip: Story = {
  ...onCanvas(),
  play: openTooltip({ info: "Group" }, { after: selectTwoTexts }),
};

export const UngroupDisabledTooltip: Story = {
  ...onCanvas(),
  play: openTooltip({ text: "Ungroup" }, { after: selectText }),
};

export const UngroupTooltip: Story = {
  ...onCanvas(["multi-page-sample.pdf"]),
  play: openTooltip({ info: "Ungroup" }, { after: selectParagraph }),
};

export const RotateLeftTooltip: Story = {
  ...onCanvas(),
  play: openTooltip({ info: "Rotate 90° left" }, { after: selectImage }),
};

export const RotateRightTooltip: Story = {
  ...onCanvas(),
  play: openTooltip({ info: "Rotate 90° right" }, { after: selectImage }),
};

export const FlipHorizontalTooltip: Story = {
  ...onCanvas(),
  play: openTooltip({ info: "Flip horizontal" }, { after: selectImage }),
};

export const FlipVerticalTooltip: Story = {
  ...onCanvas(),
  play: openTooltip({ info: "Flip vertical" }, { after: selectImage }),
};

export const RemovePasswordTooltip: Story = {
  args: { files: ["scanned-no-ocr-encrypted.pdf"] },
  play: openTooltip(
    { text: "Remove Password" },
    { after: openScannedProtected },
  ),
};
