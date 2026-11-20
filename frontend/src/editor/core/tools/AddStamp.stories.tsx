import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
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

async function enterStampText(context: PlayContext, text = "APPROVED") {
  await userEvent.type(
    await findEnabled(context, "textbox", "Stamp Text"),
    text,
  );
  await waitForPanelText(context, "Preview:");
}

async function expandVariables(context: PlayContext) {
  await userEvent.click(
    await findEnabled(context, "button", /Dynamic Variables/),
  );
  return waitForPanelText(context, "Page Information");
}

async function chooseQr(context: PlayContext) {
  await choose(context, "QR Code");
  return findEnabled(context, "textbox", "QR Code Content");
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
    "button",
    { name: "Rotation" },
    STAGE_TIMEOUT,
  );
}

async function textPositionStep(context: PlayContext) {
  await enterStampText(context);
  await openPositionStep(context);
}

async function selectPill(context: PlayContext, name: string) {
  await textPositionStep(context);
  await userEvent.click(await findEnabled(context, "button", name));
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
    await typeInto(
      context,
      "Custom Page Selection (Enter a comma-separated list of page numbers 1,5,6 or Functions like 2n+1)",
      "1,3-5",
    );
  },
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

export const DynamicVariables: Story = {
  play: expandVariables,
};

export const VariableInserted: Story = {
  play: async (context) => {
    const panel = await expandVariables(context);
    await userEvent.click(panel.getByRole("button", { name: "@page_number" }));
    await waitForPanelText(context, "Preview:");
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
  play: (context) => selectPill(context, "Rotation"),
};

export const OpacitySetting: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: (context) => selectPill(context, "Opacity"),
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

export const RotationTooltip: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: openTooltip({ info: "Rotation" }, { after: textPositionStep }),
};

export const OpacityTooltip: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: openTooltip({ info: "Opacity" }, { after: textPositionStep }),
};

export const SizeTooltip: Story = {
  // The step's number fields have no label, its slider thumbs no name.
  parameters: knownA11yIssues("aria-input-field-name", "label"),
  play: openTooltip({ info: "Font/Image Size" }, { after: textPositionStep }),
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
