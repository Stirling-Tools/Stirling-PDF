import type { StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openSelect,
  openStep,
  openTooltip,
  type PanelQueries,
  type PlayContext,
  runTool,
  selectOption,
  STAGE_TIMEOUT,
  toggle,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";

const meta = {
  title: "Tools/Check PDF accessibility/Panel",
  ...toolPanelMeta("checkAccessibility"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const REPORT: AccessibilityReport = {
  profile: "PDF/UA-1",
  tagged: true,
  declaresConformance: false,
  passesAutomatedChecks: false,
  issues: [
    {
      clause: "7.4.2",
      testNumber: "1",
      message: "Heading levels are skipped",
      severity: "error",
      specification: "ISO 14289-1:2014",
      occurrences: 2,
      autoFixable: false,
      tags: ["structure", "heading"],
      pages: [1],
      pagesComplete: true,
    },
    {
      clause: "7.3",
      testNumber: "1",
      message: "Figure has no alternative text",
      severity: "error",
      specification: "ISO 14289-1:2014",
      occurrences: 1,
      autoFixable: false,
      tags: ["alt-text", "figure"],
      pages: [1],
      pagesComplete: true,
    },
  ],
  humanChecks: [
    "Reading order follows the visual layout",
    "Image descriptions describe the image",
  ],
  automaticallyFixable: 0,
  needsInput: 1,
  figuresNeedingDescription: [
    {
      key: "fig-1",
      page: 1,
      kind: "Figure",
      x: 72,
      y: 500,
      width: 200,
      height: 120,
    },
  ],
  summary: {
    pages: 1,
    hasTitle: true,
    displaysDocTitle: false,
    hasLanguage: true,
    allFontsEmbedded: true,
    unembeddedFonts: 0,
    figures: 1,
    encrypted: false,
  },
  checks: {
    total: 120,
    failed: 2,
    passed: 118,
    rulesInProfile: 106,
    rulesFailed: 2,
  },
};

const ENDPOINT = "*/api/v1/security/accessibility-report";

const PASSING_REPORT: AccessibilityReport = {
  ...REPORT,
  declaresConformance: true,
  passesAutomatedChecks: true,
  issues: [],
  humanChecks: [],
  needsInput: 0,
  figuresNeedingDescription: [],
  summary: { ...REPORT.summary, displaysDocTitle: true, figures: 0 },
  checks: {
    total: 120,
    failed: 0,
    passed: 120,
    rulesInProfile: 106,
    rulesFailed: 0,
  },
};

const SEVERAL_FILES = {
  files: ["sample.pdf", "multi-page-sample.pdf"],
  workbench: "fileEditor",
} as const;

function respondWith(report: Partial<AccessibilityReport>) {
  return toolPanelServer(http.post(ENDPOINT, () => HttpResponse.json(report)));
}

const withReport = respondWith(REPORT);

/** Answers the first file's check and leaves every later one running. */
const secondCheckRunning = toolPanelServer(
  http.post(ENDPOINT, async ({ request }) => {
    const file = (await request.formData()).get("fileInput");
    if (file instanceof File && file.name === "sample.pdf")
      return HttpResponse.json(REPORT);
    await delay("infinite");
    return HttpResponse.json(REPORT);
  }),
);

const secondCheckFails = toolPanelServer(
  http.post(ENDPOINT, async ({ request }) => {
    const file = (await request.formData()).get("fileInput");
    return file instanceof File && file.name === "sample.pdf"
      ? HttpResponse.json(REPORT)
      : HttpResponse.json({ error: "Validator crashed" }, { status: 500 });
  }),
);

const DOWNLOAD = "Download accessibility report";

async function runCheck(context: PlayContext): Promise<PanelQueries> {
  const panel = await runTool(context);
  await panel.findByRole("button", { name: DOWNLOAD }, STAGE_TIMEOUT);
  return panel;
}

function reportTooltip(row: string) {
  return {
    parameters: withReport,
    play: openTooltip({ info: `About ${row}` }, { after: runCheck }),
  } satisfies Story;
}

const SHOW_RESULTS_FOR = "Show results for";

async function expandArea(context: PlayContext, area: string) {
  const panel = await runCheck(context);
  const toggle = panel.getByRole("button", { name: area });
  await userEvent.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "true"));
  return panel;
}

export const Panel: Story = {
  play: async (context) => {
    const panel = await waitForPanelText(context, "Standard");
    await expect(panel.getByRole("textbox", { name: "Standard" })).toHaveValue(
      "PDF/UA-1",
    );
  },
};

export const StandardOptions: Story = {
  play: async (context) => {
    const standards = await openSelect(context, "Standard");
    await expect(
      standards.getByRole("option", { name: "PDF/UA-2 (PDF 2.0)" }),
    ).toBeVisible();
  },
};

export const PdfUa2: Story = {
  play: async (context) => {
    await selectOption(context, "Standard", "PDF/UA-2 (PDF 2.0)");
  },
};

export const StandardTooltip: Story = {
  play: openTooltip({ step: "Standard" }),
};

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const Checking: Story = {
  args: SEVERAL_FILES,
  parameters: secondCheckRunning,
  play: async (context) => {
    await runTool(context);
    const panel = await waitForPanelText(context, "Checking 2 of 2...");
    await expect(panel.getByTestId("a11y-report")).toBeVisible();
  },
};

export const Report: Story = {
  parameters: withReport,
  play: async (context) => {
    const panel = await runCheck(context);
    await expect(
      panel.getByRole("img", { name: "9 of 13 checks passed" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Manual checks" }),
    ).toHaveAttribute("aria-expanded", "true");
  },
};

export const PassingReport: Story = {
  parameters: {
    ...respondWith(PASSING_REPORT),
    // The green "Pass" result fails contrast on its card.
    ...knownA11yIssues("color-contrast"),
  },
  play: async (context) => {
    const panel = await runCheck(context);
    await expect(
      panel.getByText("Passes every automated PDF/UA check."),
    ).toBeVisible();
    await expect(
      panel.queryByRole("button", { name: "Manual checks" }),
    ).toBeNull();
  },
};

export const IssueList: Story = {
  parameters: withReport,
  play: async (context) => {
    const panel = await expandArea(context, "Tags & structure");
    const issues = await panel.findAllByTestId("a11y-issue");
    await expect(issues[0]).toBeVisible();
  },
};

export const IssueDetails: Story = {
  parameters: withReport,
  play: async (context) => {
    const panel = await expandArea(context, "Tags & structure");
    const [issue] = await panel.findAllByTestId("a11y-issue");
    await userEvent.click(within(issue).getAllByRole("button")[0]);
    await userEvent.click(
      await within(issue).findByRole("button", { name: "Details" }),
    );
    await expect(await within(issue).findByText("Rule")).toBeVisible();
  },
};

export const ImagesNeedingDescriptions: Story = {
  parameters: withReport,
  play: async (context) => {
    const panel = await expandArea(context, "Alternative text");
    await expect(
      await panel.findByText("1 image needs a description (page 1)"),
    ).toBeVisible();
  },
};

export const ManualCheckTicked: Story = {
  parameters: withReport,
  play: async (context) => {
    await runCheck(context);
    await toggle(
      context,
      "checkbox",
      "Reading order follows the visual layout",
    );
  },
};

export const ManualChecksDone: Story = {
  parameters: withReport,
  play: async (context) => {
    const panel = await runCheck(context);
    await userEvent.click(
      panel.getByRole("button", { name: "Mark all as done" }),
    );
    await expect(
      await panel.findByRole("button", { name: "Clear all" }),
    ).toBeVisible();
    for (const check of panel.getAllByRole("checkbox"))
      await expect(check).toBeChecked();
  },
};

export const ManualChecksCollapsed: Story = {
  parameters: withReport,
  play: async (context) => {
    const panel = await runCheck(context);
    const toggle = panel.getByRole("button", { name: "Manual checks" });
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(toggle).toHaveAttribute("aria-expanded", "false"),
    );
  },
};

export const MultipleFiles: Story = {
  args: SEVERAL_FILES,
  parameters: withReport,
  play: async (context) => {
    const panel = await runCheck(context);
    await expect(
      panel.getByRole("textbox", { name: "Show results for" }),
    ).toHaveValue("sample.pdf - Fail");
  },
};

export const MultipleFilesPicker: Story = {
  args: SEVERAL_FILES,
  parameters: withReport,
  play: async (context) => {
    await runCheck(context);
    const files = await openSelect(context, SHOW_RESULTS_FOR);
    await expect(
      files.getByRole("option", {
        name: "multi-page-sample.pdf - Fail",
      }),
    ).toBeVisible();
  },
};

export const OneFileFailed: Story = {
  args: SEVERAL_FILES,
  parameters: secondCheckFails,
  play: async (context) => {
    await runCheck(context);
    const files = await openSelect(context, SHOW_RESULTS_FOR);
    await userEvent.click(
      files.getByRole("option", {
        name: "multi-page-sample.pdf - failed",
      }),
    );
    await waitForPanelText(context, "This file could not be checked");
  },
};

export const FileCouldNotBeChecked: Story = {
  parameters: respondWith({
    ...REPORT,
    validationError: "The validator could not parse this file.",
  }),
  play: async (context) => {
    await runTool(context);
    await waitForPanelText(context, "This file could not be checked");
    await waitForPanelText(context, /The validator could not parse this file/);
  },
};

export const ChangeStandard: Story = {
  parameters: withReport,
  play: async (context) => {
    await runCheck(context);
    const panel = await openStep(context, "Standard");
    await expect(
      await panel.findByRole("textbox", { name: "Standard" }, STAGE_TIMEOUT),
    ).toBeVisible();
    await expect(panel.queryByTestId("a11y-report")).toBeNull();
  },
};

export const TagsAndStructureTooltip = reportTooltip("Tags & structure");
export const AlternativeTextTooltip = reportTooltip("Alternative text");
export const LanguageTooltip = reportTooltip("Language");
export const MetadataAndSettingsTooltip = reportTooltip("Metadata & settings");
export const FontsTooltip = reportTooltip("Fonts");
export const LinksAndAnnotationsTooltip = reportTooltip("Links & annotations");
export const TaggedTooltip = reportTooltip("Tagged");
export const HasATitleTooltip = reportTooltip("Has a title");
export const ShowsItsTitleTooltip = reportTooltip("Shows its title");
export const DeclaresALanguageTooltip = reportTooltip("Declares a language");
export const FontsEmbeddedTooltip = reportTooltip("Fonts embedded");
export const DeclaresPdfUaTooltip = reportTooltip("Declares PDF/UA");
export const NotEncryptedTooltip = reportTooltip("Not encrypted");
export const ManualChecksTooltip = reportTooltip("Manual checks");
