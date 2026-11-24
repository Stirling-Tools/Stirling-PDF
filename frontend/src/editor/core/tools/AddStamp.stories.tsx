import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  choose,
  findEnabled,
  openColorPicker,
  openSelect,
  openStep,
  openTooltip,
  panelOf,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  typeInto,
  uploadToPanel,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import { MAX_QR_CONTENT_BYTES } from "@editor/components/tools/addStamp/useAddStampParameters";

const meta = {
  title: "Tools/Add Stamp to PDF/Panel",
  ...toolPanelMeta("addStamp"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const POSITION_STEP = "Position & Formatting";

/** A field's accessible name also carries its (i)'s text, so match the label as a prefix. */
const PAGES_TO_STAMP = /^Pages to Stamp/;
const STAMP_TEXT = /^Stamp Text/;
const QR_CONTENT = /^QR Code Content/;

async function enterStampText(context: PlayContext, text = "APPROVED") {
  await userEvent.type(await findEnabled(context, "textbox", STAMP_TEXT), text);
  await waitForPanelText(context, "Preview:");
}

const DYNAMIC_VARIABLES = "Dynamic variables";

async function openVariablePicker(context: PlayContext) {
  await userEvent.click(
    await findEnabled(context, "button", DYNAMIC_VARIABLES),
  );
  return within(
    await bodyOf(context).findByRole(
      "dialog",
      { name: DYNAMIC_VARIABLES },
      STAGE_TIMEOUT,
    ),
  );
}

async function chooseQr(context: PlayContext) {
  await choose(context, "QR Code");
  return findEnabled(context, "textbox", QR_CONTENT);
}

async function enterQrContent(context: PlayContext) {
  await userEvent.type(
    await chooseQr(context),
    "https://stirlingpdf.com/@filename",
  );
}

async function uploadStampImage(context: PlayContext) {
  await choose(context, "Image");
  const panel = await uploadToPanel(context, "sample.png");
  await panel.findByRole(
    "img",
    { name: "Selected stamp image" },
    STAGE_TIMEOUT,
  );
}

async function openPositionStep(context: PlayContext) {
  await openStep(context, POSITION_STEP);
  return (await panelOf(context)).findByRole(
    "radio",
    { name: "Rotation" },
    STAGE_TIMEOUT,
  );
}

async function textPositionStep(context: PlayContext) {
  await enterStampText(context);
  await openPositionStep(context);
}

export const Panel: Story = {};

export const NoFiles: Story = {
  args: { files: [] },
};

export const StampTextRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};

export const PageSelection: Story = {
  args: { files: ["multi-page-sample.pdf"] },
  play: async (context) => {
    await typeInto(context, PAGES_TO_STAMP, "1,3-5");
  },
};

export const PagesToStampTooltip: Story = {
  play: openTooltip({ info: /^Comma-separated page numbers or ranges/ }),
};

export const StampTextEntered: Story = {
  play: (context) => enterStampText(context, "Reviewed @date"),
};

export const TemplateMenu: Story = {
  play: async (context) => {
    const options = await openSelect(context, "Use Template");
    await expect(options.getAllByRole("option")).toHaveLength(6);
  },
};

export const TemplateChosen: Story = {
  play: async (context) => {
    const options = await openSelect(context, "Use Template");
    await userEvent.click(
      options.getByRole("option", { name: "Legal Footer" }),
    );
    await waitForPanelText(context, "Preview:");
  },
};

export const StampTextTooltip: Story = {
  play: openTooltip({ info: /^Printed on every stamped page/ }),
};

export const VariablePicker: Story = {
  play: async (context) => {
    await openVariablePicker(context);
  },
};

export const VariableInserted: Story = {
  play: async (context) => {
    await enterStampText(context, "Page ");
    const picker = await openVariablePicker(context);
    await userEvent.click(picker.getByRole("button", { name: "@page_number" }));
    await expect(await findEnabled(context, "textbox", STAMP_TEXT)).toHaveValue(
      "Page @page_number",
    );
  },
};

export const VariableExampleUsed: Story = {
  play: async (context) => {
    await enterStampText(context);
    const picker = await openVariablePicker(context);
    await userEvent.click(
      picker.getByRole("button", { name: "Page @page_number of @total_pages" }),
    );
    await expect(await findEnabled(context, "textbox", STAMP_TEXT)).toHaveValue(
      "Page @page_number of @total_pages",
    );
  },
};

export const VariableHelp: Story = {
  play: async (context) => {
    const picker = await openVariablePicker(context);
    await userEvent.click(
      picker.getByRole("button", { name: "What each variable means" }),
    );
    await bodyOf(context).findByText("What gets printed", {}, STAGE_TIMEOUT);
  },
};

export const AlphabetMenu: Story = {
  play: async (context) => {
    const options = await openSelect(context, "Alphabet");
    await expect(options.getAllByRole("option").length).toBeGreaterThan(1);
  },
};

export const QrCodeStamp: Story = {
  play: async (context) => {
    await chooseQr(context);
  },
};

export const QrCodeContentEntered: Story = {
  play: enterQrContent,
};

export const QrCodeContentTooLong: Story = {
  play: async (context) => {
    await userEvent.click(await chooseQr(context));
    await userEvent.paste("x".repeat(MAX_QR_CONTENT_BYTES + 1));
    await waitForPanelText(
      context,
      "Too long to fit in a QR code. Shorten the content.",
    );
  },
};

export const QrCodeContentTooltip: Story = {
  play: openTooltip({ info: /^Text or link to encode/ }, { after: chooseQr }),
};

export const ImageStamp: Story = {
  play: async (context) => {
    await choose(context, "Image");
    await waitForPanelText(context, "Choose File");
  },
};

export const ImageStampChosen: Story = {
  play: uploadStampImage,
};

export const NoStampSelected: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: async (context) => {
    await openPositionStep(context);
    await waitForPanelText(context, "No stamp selected. Return to Step 1.");
  },
};

export const TextPositionAndFormatting: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: textPositionStep,
};

export const QuickPositionChosen: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: async (context) => {
    await textPositionStep(context);
    await userEvent.click(await findEnabled(context, "button", "1"));
  },
};

export const RotationSetting: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: async (context) => {
    await textPositionStep(context);
    await choose(context, "Rotation");
  },
};

export const OpacitySetting: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: async (context) => {
    await textPositionStep(context);
    await choose(context, "Opacity");
  },
};

export const TextColorPicker: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: async (context) => {
    await textPositionStep(context);
    await openColorPicker(context, "Custom Text Color");
  },
};

export const MarginMenu: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: async (context) => {
    await textPositionStep(context);
    const options = await openSelect(context, "Margin");
    await expect(options.getAllByRole("option")).toHaveLength(4);
  },
};

export const ImagePositionAndFormatting: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: async (context) => {
    await uploadStampImage(context);
    await openPositionStep(context);
    await waitForPanelText(
      context,
      "Drag the stamp to the desired location in the preview window.",
    );
  },
};

export const ImageQuickPosition: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: async (context) => {
    await uploadStampImage(context);
    await openPositionStep(context);
    await choose(context, "Quick Position");
    await waitForPanelText(
      context,
      "Select a position on the page to place the stamp.",
    );
  },
};

export const QrCodePositionAndFormatting: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: async (context) => {
    await enterQrContent(context);
    await openPositionStep(context);
    await waitForPanelText(context, "QR Code Size");
  },
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/misc/add-stamp", "sample.pdf"),
  ),
  play: async (context) => {
    await enterStampText(context);
    await runToResults(context);
  },
};
