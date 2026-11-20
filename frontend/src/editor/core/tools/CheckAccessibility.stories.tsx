import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { userEvent, within } from "storybook/test";
import {
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  runTool,
  STAGE_TIMEOUT,
  waitForToolPanel,
  type PlayContext,
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

function respondWith(report: Partial<AccessibilityReport>) {
  return toolPanelServer(
    http.post("*/api/v1/security/accessibility-report", () =>
      HttpResponse.json(report),
    ),
  );
}

const withReport = respondWith(REPORT);

async function runCheck(context: PlayContext): Promise<void> {
  const panel = await runTool(context);
  await panel.findByRole(
    "button",
    { name: "Download accessibility report" },
    STAGE_TIMEOUT,
  );
}

function reportTooltip(row: string) {
  return {
    parameters: withReport,
    play: openTooltip({ info: `About ${row}` }, { after: runCheck }),
  } satisfies Story;
}

export const Panel: Story = {};

export const Report: Story = {
  parameters: withReport,
  play: runCheck,
};

export const IssueDetails: Story = {
  parameters: withReport,
  play: async (context) => {
    await runCheck(context);
    const panel = within(await waitForToolPanel(context));
    await userEvent.click(
      panel.getByRole("button", { name: "Tags & structure" }),
    );
    const [issue] = await panel.findAllByTestId("a11y-issue");
    await userEvent.click(within(issue).getAllByRole("button")[0]);
    await userEvent.click(
      await within(issue).findByRole("button", { name: "Details" }),
    );
  },
};

export const MultipleFiles: Story = {
  args: { files: ["sample.pdf", "multi-page-sample.pdf"] },
  parameters: withReport,
  play: runCheck,
};

export const FileCouldNotBeChecked: Story = {
  parameters: respondWith({
    ...REPORT,
    validationError: "The validator could not parse this file.",
  }),
  play: async (context) => {
    const panel = await runTool(context);
    await panel.findByText(
      "The validator could not parse this file.",
      { exact: false },
      STAGE_TIMEOUT,
    );
  },
};

export const StandardTooltip: Story = {
  play: openTooltip({ step: "Standard" }),
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
