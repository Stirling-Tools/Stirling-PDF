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
  openSelect,
  openStep,
  openTooltip,
  type PlayContext,
  runToResults,
  selectOption,
  STAGE_TIMEOUT,
  toggle,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/OCR & Cleanup scans/Panel",
  ...toolPanelMeta("ocr", { files: ["scanned-no-ocr.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const LANGUAGES_ENDPOINT = "*/api/v1/ui-data/ocr-pdf";

/** The OCR languages the server has installed; the picker preselects the browser's when it is one. */
function installedLanguages(languages: string[]) {
  return http.get(LANGUAGES_ENDPOINT, () => HttpResponse.json({ languages }));
}

const WITH_ENGLISH = toolPanelServer(
  installedLanguages(["eng", "deu", "fra", "spa"]),
);
const WITHOUT_ENGLISH = toolPanelServer(
  installedLanguages(["deu", "fra", "spa"]),
);

const PROCESSING_OPTIONS = [
  "Compatibility Mode",
  "Create a text file",
  "Deskew pages",
  "Clean input file",
  "Clean final output",
];

async function openLanguages(context: PlayContext, current: string) {
  const panel = await waitForPanelText(context, current);
  await userEvent.click(panel.getByRole("button", { name: current }));
  const hint = await bodyOf(context).findByText(
    "Looking for additional languages?",
    undefined,
    STAGE_TIMEOUT,
  );
  // Mounted is not open: the dropdown is hidden until its transition ends.
  await waitFor(() => expect(hint).toBeVisible(), STAGE_TIMEOUT);
  return panel;
}

async function searchLanguages(context: PlayContext, term: string) {
  await openLanguages(context, "English");
  await userEvent.type(bodyOf(context).getByPlaceholderText("Search..."), term);
}

async function openAdvanced(context: PlayContext) {
  await waitForPanelText(context, "English");
  await openStep(context, "Advanced");
  return waitForPanelText(context, "Processing Options");
}

export const Panel: Story = {
  parameters: WITH_ENGLISH,
  play: async (context) => {
    const panel = await waitForPanelText(context, "English");
    await expect(panel.getByRole("textbox", { name: "OCR Mode" })).toHaveValue(
      "Auto (skip text layers)",
    );
    await expect(panel.getByText("Languages")).toBeVisible();
    await expect(panel.queryByText("Processing Options")).toBeNull();
  },
};

export const NoLanguageSelected: Story = {
  parameters: WITHOUT_ENGLISH,
  play: async (context) => {
    await waitForPanelText(context, "Select languages");
  },
};

export const LanguageRequiredTooltip: Story = {
  parameters: WITHOUT_ENGLISH,
  play: openTooltip(
    { runButton: true },
    { after: (context) => waitForPanelText(context, "Select languages") },
  ),
};

export const LanguagesLoadFailed: Story = {
  parameters: toolPanelServer(
    http.get(LANGUAGES_ENDPOINT, () => new HttpResponse(null, { status: 500 })),
  ),
  play: async (context) => {
    await openLanguages(context, "Select languages");
    await waitFor(() =>
      expect(bodyOf(context).getByText("No items available")).toBeVisible(),
    );
  },
};

export const OcrModeOptions: Story = {
  parameters: WITH_ENGLISH,
  play: async (context) => {
    const modes = await openSelect(context, "OCR Mode");
    for (const option of [
      "Auto (skip text layers)",
      "Force (re-OCR all, replace text)",
      "Strict (abort if text found)",
    ])
      await expect(modes.getByRole("option", { name: option })).toBeVisible();
  },
};

export const StrictMode: Story = {
  parameters: WITH_ENGLISH,
  play: async (context) => {
    await selectOption(context, "OCR Mode", "Strict (abort if text found)");
  },
};

export const LanguageOptions: Story = {
  // The language picker's checkboxes have no label.
  parameters: { ...WITH_ENGLISH, ...knownA11yIssues("label") },
  play: async (context) => {
    await openLanguages(context, "English");
    await waitFor(() =>
      expect(bodyOf(context).getByText("View setup guide →")).toBeVisible(),
    );
    for (const language of ["English", "German", "French", "Spanish"])
      await expect(bodyOf(context).getAllByText(language).at(-1)).toBeVisible();
  },
};

export const LanguageSearch: Story = {
  // The language picker's checkboxes have no label.
  parameters: { ...WITH_ENGLISH, ...knownA11yIssues("label") },
  play: async (context) => {
    await searchLanguages(context, "fre");
    await expect(bodyOf(context).getByText("French")).toBeVisible();
    await expect(bodyOf(context).queryByText("Spanish")).toBeNull();
  },
};

export const LanguageSearchNoResults: Story = {
  parameters: WITH_ENGLISH,
  play: async (context) => {
    await searchLanguages(context, "zzz");
    await expect(bodyOf(context).getByText("No results found")).toBeVisible();
  },
};

export const SeveralLanguages: Story = {
  // The language picker's checkboxes have no label.
  parameters: { ...WITH_ENGLISH, ...knownA11yIssues("label") },
  play: async (context) => {
    const panel = await openLanguages(context, "English");
    await userEvent.click(bodyOf(context).getByText("German"));
    await expect(
      await panel.findByRole("button", { name: "2 selected" }),
    ).toBeVisible();
  },
};

export const AdvancedStep: Story = {
  parameters: WITH_ENGLISH,
  play: async (context) => {
    const panel = await openAdvanced(context);
    for (const option of PROCESSING_OPTIONS)
      await expect(
        panel.getByRole("checkbox", { name: option }),
      ).not.toBeChecked();
    await expect(panel.queryByRole("textbox", { name: "OCR Mode" })).toBeNull();
  },
};

export const AdvancedOptionsChosen: Story = {
  parameters: WITH_ENGLISH,
  play: async (context) => {
    await openAdvanced(context);
    for (const option of PROCESSING_OPTIONS)
      await toggle(context, "checkbox", option);
  },
};

export const SettingsTooltip: Story = {
  parameters: WITH_ENGLISH,
  play: openTooltip({ step: "Settings" }),
};

export const AdvancedTooltip: Story = {
  parameters: WITH_ENGLISH,
  play: openTooltip({ step: "Advanced" }, { after: openAdvanced }),
};

export const NoFiles: Story = {
  args: { files: [] },
  parameters: WITH_ENGLISH,
  play: async (context) => {
    const panel = await openStep(context, "Settings");
    await expect(panel.queryByRole("textbox", { name: "OCR Mode" })).toBeNull();
  },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  parameters: WITH_ENGLISH,
  play: openTooltip({ runButton: true }),
};

export const Results: Story = {
  parameters: toolPanelServer(
    installedLanguages(["eng"]),
    fixtureResponse("/api/v1/misc/ocr-pdf", "sample.pdf"),
  ),
  play: async (context) => {
    await waitForPanelText(context, "English");
    await runToResults(context);
  },
};
