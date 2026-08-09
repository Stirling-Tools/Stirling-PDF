import type { Meta, StoryObj } from "@storybook/react-vite";
import AutoRotateReport from "@app/components/tools/autoRotate/AutoRotateReport";
import type {
  AutoRotatePageResult,
  AutoRotateReport as ReportData,
} from "@app/hooks/tools/autoRotate/useAutoRotateOperation";

const page = (
  pageNumber: number,
  over: Partial<AutoRotatePageResult> = {},
): AutoRotatePageResult => ({
  pageNumber,
  currentRotation: 0,
  correction: 0,
  confidence: 96,
  method: "text",
  apply: true,
  ...over,
});

const report = (pages: AutoRotatePageResult[]): ReportData => ({
  pages,
  totalPages: pages.length,
  pagesToRotate: pages.filter((p) => p.apply && p.correction !== 0).length,
  detectedByText: pages.filter((p) => p.method === "text").length,
  detectedByOsd: pages.filter((p) => p.method === "osd").length,
  inferred: pages.filter((p) => p.method === "inferred").length,
  undetected: pages.filter((p) => p.confidence === null).length,
});

/** What auto-rotate decided, per page: how each page's orientation was
 *  detected, how confident that was, and whether a correction will be applied. */
const meta: Meta<typeof AutoRotateReport> = {
  title: "Tools/AutoRotate/AutoRotateReport",
  component: AutoRotateReport,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof AutoRotateReport>;

/** A mixed document: text detection, an OCR fallback, and a page left alone. */
export const Default: Story = {
  args: {
    reports: [
      {
        fileName: "contract-2026.pdf",
        report: report([
          page(1),
          page(2, { correction: 90, currentRotation: 270 }),
          page(3, { method: "osd", confidence: 12.4, correction: 180 }),
          page(4, { confidence: null, apply: false, note: "No text found" }),
        ]),
      },
    ],
  },
};

/** Nothing needed correcting. */
export const NothingToRotate: Story = {
  args: {
    reports: [
      { fileName: "already-upright.pdf", report: report([page(1), page(2)]) },
    ],
  },
};

/** Several files in one run — each keeps its own breakdown. */
export const MultipleFiles: Story = {
  args: {
    reports: [
      {
        fileName: "scans-batch-a.pdf",
        report: report([page(1, { correction: 90 }), page(2)]),
      },
      {
        fileName: "scans-batch-b.pdf",
        report: report([
          page(1, { method: "osd", confidence: 8.1, correction: 270 }),
          page(2, { confidence: null, apply: false }),
        ]),
      },
    ],
  },
};

/** A long document, to check the per-page list stays readable as it grows. */
export const LongDocument: Story = {
  args: {
    reports: [
      {
        fileName: "deposition-transcript.pdf",
        report: report(
          Array.from({ length: 40 }, (_, i) =>
            page(i + 1, {
              correction: i % 3 === 0 ? 90 : 0,
              method: i % 5 === 0 ? "osd" : "text",
              confidence: i % 7 === 0 ? null : 70 + (i % 30),
              apply: i % 7 !== 0,
            }),
          ),
        ),
      },
    ],
  },
};

/** No files analysed yet. */
export const Empty: Story = { args: { reports: [] } };
