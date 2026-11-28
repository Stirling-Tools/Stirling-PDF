import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, waitFor } from "storybook/test";
import {
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  openTooltip,
  type PlayContext,
  runTool,
  STAGE_TIMEOUT,
  toggle,
  typeInto,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import {
  AUTO_ROTATE_ENDPOINT,
  type AutoRotatePageResult,
  type AutoRotateReport,
} from "@editor/hooks/tools/autoRotate/useAutoRotateOperation";

const meta = {
  title: "Tools/Auto Rotate/Panel",
  ...toolPanelMeta("autoRotate", { files: ["multi-page-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

function page(
  pageNumber: number,
  result: Omit<AutoRotatePageResult, "pageNumber" | "currentRotation">,
): AutoRotatePageResult {
  return { pageNumber, currentRotation: 0, ...result };
}

/** One page for every detection method and every note the report can label. */
const REPORT_PAGES: AutoRotatePageResult[] = [
  page(1, { correction: 90, confidence: 98.4, method: "text", apply: true }),
  page(2, { correction: 0, confidence: 3.2, method: "osd", apply: false }),
  page(3, {
    correction: 0,
    confidence: 6.2,
    method: "osd",
    apply: false,
    note: "belowThreshold",
  }),
  page(4, {
    correction: 0,
    confidence: null,
    method: "inferred",
    apply: false,
    note: "inferredFromDocument",
  }),
  ...(
    [
      "tooFewGlyphs",
      "noDominantDirection",
      "tesseractUnavailable",
      "blankPage",
      "osdFailed",
      "osdNoVerdict",
    ] as const
  ).map((note, index) =>
    page(5 + index, {
      correction: 0,
      confidence: null,
      method: "none",
      apply: false,
      note,
    }),
  ),
];

const REPORT: AutoRotateReport = {
  pages: REPORT_PAGES,
  totalPages: REPORT_PAGES.length,
  pagesToRotate: 1,
  detectedByText: 1,
  detectedByOsd: 2,
  inferred: 1,
  undetected: 6,
};

const SUMMARY = "1 of 10 pages rotated, 9 left as they are";

const reportServer = toolPanelServer(
  http.post(`*${AUTO_ROTATE_ENDPOINT}`, () => HttpResponse.json(REPORT)),
);

async function runDetection(context: PlayContext) {
  const panel = await runTool(context);
  await panel.findByText("Detection report", undefined, STAGE_TIMEOUT);
  return panel;
}

export const Panel: Story = {};

export const TextOnly: Story = {
  play: async (context) => {
    await choose(context, "Text only");
  },
};

export const OcrOnlyAdjusted: Story = {
  play: async (context) => {
    await choose(context, "OCR only");
    await typeInto(context, "Confidence threshold", "30");
    await toggle(context, "checkbox", "Rotate low confidence pages to match");
  },
};

export const SettingsTooltip: Story = {
  play: openTooltip({ step: "Settings" }),
};

export const DetectionReport: Story = {
  parameters: {
    ...reportServer,
    // The report's scroll area has nothing in it that takes focus.
    ...knownA11yIssues("scrollable-region-focusable"),
  },
  play: async (context) => {
    const panel = await runDetection(context);
    await expect(panel.getByText("90° CW")).toBeVisible();
    await expect(panel.getByText(SUMMARY)).toBeVisible();
  },
};

export const DetectionReportPerFile: Story = {
  args: {
    files: ["sample.pdf", "multi-page-sample.pdf"],
    workbench: "fileEditor",
  },
  parameters: {
    ...reportServer,
    // The report's scroll area has nothing in it that takes focus.
    ...knownA11yIssues("scrollable-region-focusable"),
  },
  play: async (context) => {
    const panel = await runDetection(context);
    await waitFor(
      () => expect(panel.getAllByText(SUMMARY)).toHaveLength(2),
      STAGE_TIMEOUT,
    );
  },
};
