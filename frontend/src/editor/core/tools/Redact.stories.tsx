import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  fixtureResponse,
  knownA11yIssues,
  onViewer,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  dragOnPage,
  findEnabled,
  findPageElement,
  openStep,
  openTooltip,
  panelOf,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  toggle,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Redact/Panel",
  ...toolPanelMeta("redact"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const noFiles = { files: [] } as const;

async function addWords(context: PlayContext, ...words: string[]) {
  const panel = await panelOf(context);
  const input = await panel.findByPlaceholderText(
    "Enter a word",
    undefined,
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(input).toBeEnabled(), STAGE_TIMEOUT);
  for (const word of words) {
    await userEvent.type(input, word);
    await userEvent.click(panel.getByRole("button", { name: /Add$/ }));
    await panel.findByTitle(word);
  }
  return panel;
}

async function tickTypes(context: PlayContext, ...types: string[]) {
  for (const type of types) await toggle(context, "checkbox", type);
  return panelOf(context);
}

async function openAdvancedWithTypes(context: PlayContext) {
  await tickTypes(context, "Email addresses");
  const panel = await openAdvanced(context);
  const useRegex = panel.getByRole("checkbox", { name: "Use Regex" });
  await expect(useRegex).toBeChecked();
  await expect(useRegex).toBeDisabled();
  return panel;
}

async function openAdvanced(context: PlayContext) {
  const panel = await openStep(context, "Advanced");
  await panel.findByRole("checkbox", { name: "Use Regex" }, STAGE_TIMEOUT);
  return panel;
}

async function chooseManual(context: PlayContext) {
  const panel = await choose(context, "Manual");
  await panel.findByText("Manual Redaction Controls", undefined, STAGE_TIMEOUT);
  return panel;
}

async function findManualColour(context: PlayContext) {
  const panel = await chooseManual(context);
  const colour = await findEnabled(context, "textbox", "Redaction Color");
  await findPageElement(context, '[data-page-index="0"] img');
  return { panel, colour };
}

export const Panel: Story = {};

export const WordsAdded: Story = {
  play: async (context) => {
    const panel = await addWords(context, "Confidential", "Top-Secret");
    const run = panel.getByRole("button", { name: /^Redact/ });
    await waitFor(() => expect(run).toBeEnabled(), STAGE_TIMEOUT);
  },
};

export const WordRemoved: Story = {
  play: async (context) => {
    const panel = await addWords(context, "Confidential", "Top-Secret");
    await userEvent.click(panel.getAllByRole("button", { name: "Remove" })[0]);
    await waitFor(() => expect(panel.queryByTitle("Confidential")).toBeNull());
    await expect(panel.getByTitle("Top-Secret")).toBeVisible();
  },
};

export const CommonTypesSelected: Story = {
  play: async (context) => {
    await tickTypes(context, "Email addresses", "Phone numbers");
    const panel = await addWords(context, "J. Smith (Jr.)");
    const run = panel.getByRole("button", { name: /^Redact/ });
    await waitFor(() => expect(run).toBeEnabled(), STAGE_TIMEOUT);
  },
};

export const AdvancedSettingsWithCommonTypes: Story = {
  play: async (context) => {
    await openAdvancedWithTypes(context);
  },
};

export const AdvancedSettings: Story = {
  play: async (context) => {
    await openAdvanced(context);
  },
};

export const AdvancedSettingsChanged: Story = {
  play: async (context) => {
    const panel = await openAdvanced(context);
    const colour = panel.getByRole("textbox", { name: "Box Color" });
    await userEvent.clear(colour);
    await userEvent.type(colour, "#c0392b"); // theme-allow-color a user-picked colour the tool sends to the server
    const padding = panel.getByRole("textbox", {
      name: "Custom Extra Padding",
    });
    await userEvent.tripleClick(padding);
    await userEvent.keyboard("3");
    for (const name of [
      "Use Regex",
      "Whole Word Search",
      "Case Sensitive Matching",
      "Convert PDF to PDF-Image",
    ])
      await toggle(context, "checkbox", name);
    await waitFor(() => expect(padding).toHaveValue("3"));
  },
};

export const ManualMode: Story = {
  ...onViewer(),
  play: async (context) => {
    await findManualColour(context);
  },
};

export const ManualModeWithMarks: Story = {
  ...onViewer(),
  play: async (context) => {
    const { panel } = await findManualColour(context);
    await dragOnPage(
      context,
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.4 },
      '[data-page-index="0"]',
    );
    await panel.findByRole(
      "button",
      { name: /^Apply Redactions \(1\)/ },
      STAGE_TIMEOUT,
    );
    await expect(
      panel.getByRole("button", { name: "Save Changes" }),
    ).toBeEnabled();
  },
};

export const NoFiles: Story = {
  args: noFiles,
};

export const RedactionMethodTooltip: Story = {
  play: openTooltip({ step: "Redaction Method" }),
};

export const RedactionSettingsTooltip: Story = {
  play: openTooltip({ step: "Redaction Settings" }),
};

export const WordsToRedactTooltip: Story = {
  play: openTooltip({ info: /^Each word or phrase is found and redacted/ }),
};

export const UseRegexLockedTooltip: Story = {
  play: openTooltip(
    { info: /^Common types are regular expressions/ },
    { after: openAdvancedWithTypes },
  ),
};

export const AdvancedTooltip: Story = {
  // The tooltip's body scrolls but cannot take keyboard focus.
  parameters: knownA11yIssues("scrollable-region-focusable"),
  play: openTooltip({ step: "Advanced" }, { after: openAdvanced }),
};

export const ConvertToImageTooltip: Story = {
  play: openTooltip(
    { info: /^Converts the PDF to an image-based PDF/ },
    { after: openAdvanced },
  ),
};

export const ManualRedactionControlsTooltip: Story = {
  ...onViewer(),
  play: openTooltip(
    { step: "Manual Redaction Controls" },
    { after: findManualColour },
  ),
};

export const RedactionToolsTooltip: Story = {
  ...onViewer(),
  play: openTooltip(
    { info: /^Select text or draw areas on the PDF/ },
    { after: findManualColour },
  ),
};

export const AutomaticUnavailableTooltip: Story = {
  args: noFiles,
  play: openTooltip({
    element: async (context) => {
      const panel = await panelOf(context);
      const automatic = await panel.findByRole(
        "radio",
        { name: "Automatic" },
        STAGE_TIMEOUT,
      );
      await waitFor(() => expect(automatic).toBeDisabled());
      return within(automatic.parentElement).getByText("Automatic");
    },
  }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    fixtureResponse("/api/v1/security/auto-redact", "sample.pdf"),
  ),
  play: async (context) => {
    await addWords(context, "Confidential");
    await runToResults(context);
  },
};
