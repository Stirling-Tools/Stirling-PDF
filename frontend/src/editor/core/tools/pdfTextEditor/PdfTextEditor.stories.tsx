import type { StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import {
  endpointUnavailable,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  choose,
  openTooltip,
  panelOf,
  type PlayContext,
  STAGE_TIMEOUT,
  unlockEncryptedPdf,
  untilPanelShows,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { __resetEditorStoreForTests } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import type { FixtureName } from "@editor/components/tools/toolPanelStory/fixtures";

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

/** The View section shows as soon as a document has opened in the panel. */
function waitForDocument(context: PlayContext) {
  return waitForPanelText(context, "Rulers and guides");
}

/** Where an object on the editor canvas sits, for a click at its centre. */
async function pageTarget(context: PlayContext, objectTestId: string) {
  const target = await within(context.canvasElement).findByTestId(
    objectTestId,
    undefined,
    STAGE_TIMEOUT,
  );
  target.scrollIntoView({ block: "center" });
  const box = target.getBoundingClientRect();
  return {
    target,
    coords: {
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    },
  };
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
  const { target, coords } = await pageTarget(context, objectTestId);
  const user = userEvent.setup();
  if (extend) await user.keyboard("{Shift>}");
  await user.pointer({ keys: "[MouseLeft]", target, coords });
  if (extend) await user.keyboard("{/Shift}");
}

/**
 * Right-clicks an object on the canvas, opening the editor's menu for it.
 * Inside text being typed the browser's own menu stays, for its spelling
 * suggestions, so the text the selecting click put a caret in lets go first.
 */
async function rightClickOnPage(context: PlayContext, objectTestId: string) {
  (
    context.canvasElement.ownerDocument.activeElement as HTMLElement | null
  )?.blur();
  const { target, coords } = await pageTarget(context, objectTestId);
  // The page reads the click's position to find what was right-clicked.
  await fireEvent.contextMenu(target, { ...coords, button: 2 });
}

/** Picks objects on the page and waits for the selection bar over them. */
function selectOnPage(...picks: { testId: string; extend?: boolean }[]) {
  return async (context: PlayContext): Promise<void> => {
    await waitForDocument(context);
    for (const { testId, extend } of picks)
      await clickOnPage(context, testId, { extend });
    await bodyOf(context).findByTestId(
      "pdf-editor-selection-bar",
      undefined,
      STAGE_TIMEOUT,
    );
  };
}

/** Opens the document's font list from its row. */
async function openFonts(context: PlayContext) {
  const panel = await openAdvancedSettings(context);
  await panel.findAllByTestId(
    "pdf-editor-font-missing",
    undefined,
    STAGE_TIMEOUT,
  );
  return panel;
}

/** Opens Advanced, which holds the fonts, colours and how text is read. */
async function openAdvancedSettings(context: PlayContext) {
  const panel = await waitForDocument(context);
  await userEvent.click(await panel.findByRole("button", { name: "Advanced" }));
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

/** On desktop the selection's tools sit in the selection bar over the page. */
function selectionBarButton(context: PlayContext, name: string) {
  return within(context.canvasElement.ownerDocument.body).findByRole(
    "button",
    { name },
    STAGE_TIMEOUT,
  );
}

/** Opens Position & size from the selection bar. */
async function openPositionAndSize(context: PlayContext) {
  await selectText(context);
  await userEvent.click(await selectionBarButton(context, "Position & size"));
  await bodyOf(context).findByTestId(
    "pdf-editor-geometry-section",
    undefined,
    STAGE_TIMEOUT,
  );
}

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

/** Steps a Position & size field up a point with the arrow key. */
async function nudgeUp(context: PlayContext, label: string) {
  const input = bodyOf(context).getByRole("textbox", { name: label });
  const before = Number.parseFloat((input as HTMLInputElement).value);
  await userEvent.click(input);
  await userEvent.keyboard("{ArrowUp}");
  await waitFor(() => expect(input).toHaveValue((before + 1).toFixed(1)));
}

export const Panel: Story = {
  play: async (context) => {
    const panel = await waitForDocument(context);
    await expect(panel.getByText("Add to page")).toBeVisible();
    // Nothing to save until there are edits.
    await expect(
      panel.getByRole("button", { name: "Save PDF" }),
    ).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Download" })).toBeVisible();
  },
};

export const NoFile: Story = {
  args: { files: [] },
  play: untilPanelShows("No file loaded"),
};

export const FontList: Story = {
  play: async (context) => {
    const panel = await openFonts(context);
    await expect(
      panel.getAllByTestId("pdf-editor-font-missing")[0],
    ).toBeVisible();
    await expect(
      panel.getByRole("checkbox", { name: "Rulers and guides" }),
    ).not.toBeChecked();
  },
};

export const FontStatusTooltip: Story = {
  play: openTooltip(
    {
      element: async (context) =>
        bodyOf(context).findByTestId("pdf-editor-font-compat"),
    },
    { after: waitForDocument },
  ),
};

/** Change all fonts, picked over the panel while the page shows each pick. */
export const ChangeAllFonts: Story = {
  ...onCanvas(),
  play: async (context) => {
    const panel = await openAdvancedSettings(context);
    await userEvent.click(
      panel.getByRole("button", { name: "Change all fonts" }),
    );
    await bodyOf(context).findByTestId(
      "pdf-editor-font-change-panel",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

/** A swatch's colour, picked over the panel while the page shows it. */
export const ChangeColour: Story = {
  ...onCanvas(),
  play: async (context) => {
    const panel = await openAdvancedSettings(context);
    const [swatch] = await panel.findAllByTestId(/^pdf-editor-colour-/);
    await userEvent.click(swatch);
    await bodyOf(context).findByTestId(
      "pdf-editor-colour-change-panel",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const RulersOn: Story = {
  play: async (context) => {
    const panel = await waitForDocument(context);
    const rulers = panel.getByRole("checkbox", { name: "Rulers and guides" });
    await userEvent.click(rulers);
    await waitFor(() => expect(rulers).toBeChecked());
  },
};

export const DocumentAdvancedSettings: Story = {
  play: async (context) => {
    const panel = await openAdvancedSettings(context);
    await expect(panel.getByRole("radio", { name: "Auto" })).toBeChecked();
    await expect(panel.getByRole("radio", { name: "Grow" })).toBeChecked();
  },
};

export const TextGroupingTooltip: Story = {
  play: openTooltip(
    { info: /^Groups equal-spaced lines into paragraphs/ },
    { after: openAdvancedSettings },
  ),
};

export const TextBoxWidthTooltip: Story = {
  play: openTooltip(
    { info: /^Grow widens a box as you type/ },
    { after: openAdvancedSettings },
  ),
};

export const LineGrouping: Story = {
  play: async (context) => {
    await openAdvancedSettings(context);
    await choose(context, "Line");
  },
};

export const WrapTextBoxes: Story = {
  play: async (context) => {
    await openAdvancedSettings(context);
    await choose(context, "Wrap");
  },
};

/** The selection's controls ride the bar over the page; the panel keeps the document. */
export const TextSelected: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectText(context);
    await expect(
      await selectionBarButton(context, "Position & size"),
    ).toBeEnabled();
    const panel = await panelOf(context);
    await expect(
      panel.queryByTestId("pdf-editor-selection-inspector"),
    ).toBeNull();
  },
};

export const PositionAndSize: Story = {
  ...onCanvas(),
  play: openPositionAndSize,
};

export const TextNudged: Story = {
  ...onCanvas(),
  play: async (context) => {
    await openPositionAndSize(context);
    await nudgeUp(context, "X");
    await nudgeUp(context, "Y");
  },
};

/** Clearing a position field to retype it commits 0 at once, moving the text to the page edge. */
export const TextPositionCleared: Story = {
  ...onCanvas(),
  play: async (context) => {
    await openPositionAndSize(context);
    const x = bodyOf(context).getByRole("textbox", { name: "X" });
    await userEvent.clear(x);
    await waitFor(() => expect(x).toHaveValue("0.0"));
  },
};

/** Two texts: position and size need a single object; Group joins them. */
export const SeveralTextsSelected: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectTwoTexts(context);
    await expect(
      await selectionBarButton(context, "Position & size"),
    ).toBeDisabled();
    await rightClickOnPage(context, "pdf-editor-run-p0-t0");
    await expect(
      await bodyOf(context).findByTestId(
        "pdf-editor-context-group",
        undefined,
        STAGE_TIMEOUT,
      ),
    ).toBeVisible();
  },
};

/** A paragraph of several lines can be split back from its right-click menu. */
export const ParagraphSelected: Story = {
  ...onCanvas(["multi-page-sample.pdf"]),
  play: async (context) => {
    await selectParagraph(context);
    await rightClickOnPage(context, "pdf-editor-run-p1-t23");
    await expect(
      await bodyOf(context).findByTestId(
        "pdf-editor-context-ungroup",
        undefined,
        STAGE_TIMEOUT,
      ),
    ).toBeVisible();
  },
};

export const ImageSelected: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectImage(context);
    await expect(
      await selectionBarButton(context, "Replace, keeping placement"),
    ).toBeVisible();
  },
};

/** A shape has no position fields, only the bar's arrange and delete. */
export const ShapeSelected: Story = {
  ...onCanvas(),
  play: async (context) => {
    await selectShape(context);
    await expect(
      bodyOf(context).queryByRole("button", { name: "Position & size" }),
    ).toBeNull();
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
    {
      element: (context) =>
        bodyOf(context).findByRole("textbox", { name: "Width" }),
    },
    { after: openPositionAndSize },
  ),
};

export const TextHeightTooltip: Story = {
  ...onCanvas(),
  play: openTooltip(
    {
      element: (context) =>
        bodyOf(context).findByRole("textbox", { name: "Height" }),
    },
    { after: openPositionAndSize },
  ),
};

export const RotateLeftTooltip: Story = {
  ...onCanvas(),
  play: openTooltip(
    { element: (context) => selectionBarButton(context, "Rotate 90° left") },
    { after: selectImage },
  ),
};

export const RotateRightTooltip: Story = {
  ...onCanvas(),
  play: openTooltip(
    { element: (context) => selectionBarButton(context, "Rotate 90° right") },
    { after: selectImage },
  ),
};

export const FlipHorizontalTooltip: Story = {
  ...onCanvas(),
  play: openTooltip(
    { element: (context) => selectionBarButton(context, "Flip horizontal") },
    { after: selectImage },
  ),
};

export const FlipVerticalTooltip: Story = {
  ...onCanvas(),
  play: openTooltip(
    { element: (context) => selectionBarButton(context, "Flip vertical") },
    { after: selectImage },
  ),
};

export const RemovePasswordTooltip: Story = {
  args: { files: ["scanned-no-ocr-encrypted.pdf"] },
  play: openTooltip(
    { text: "Remove Password" },
    { after: openScannedProtected },
  ),
};
