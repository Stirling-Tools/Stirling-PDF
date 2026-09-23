import type { Meta, StoryObj } from "@storybook/react-vite";
import ComparePixelWorkbenchView from "@app/components/tools/compare/ComparePixelWorkbenchView";
import type { CompareResultPixelData } from "@app/types/compare";

// A tiny transparent PNG data URI so the <img> elements have something valid to
// load without reaching out to a real file or network resource.
const PLACEHOLDER_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const baseResult: CompareResultPixelData = {
  mode: "pixel",
  base: { fileId: "base-file", fileName: "contract-v1.pdf" },
  comparison: { fileId: "comparison-file", fileName: "contract-v2.pdf" },
  pages: [
    {
      pageNumber: 1,
      width: 612,
      height: 792,
      baseImageUrl: PLACEHOLDER_IMAGE,
      comparisonImageUrl: PLACEHOLDER_IMAGE,
      diffImageUrl: PLACEHOLDER_IMAGE,
      diffPixels: 1200,
      totalPixels: 484704,
      diffRatio: 0.0025,
      sizeMismatch: false,
    },
    {
      pageNumber: 2,
      width: 612,
      height: 792,
      baseImageUrl: PLACEHOLDER_IMAGE,
      comparisonImageUrl: PLACEHOLDER_IMAGE,
      diffImageUrl: PLACEHOLDER_IMAGE,
      diffPixels: 0,
      totalPixels: 484704,
      diffRatio: 0,
      sizeMismatch: false,
    },
    {
      pageNumber: 3,
      width: 612,
      height: 792,
      baseImageUrl: PLACEHOLDER_IMAGE,
      comparisonImageUrl: PLACEHOLDER_IMAGE,
      diffImageUrl: PLACEHOLDER_IMAGE,
      diffPixels: 96940,
      totalPixels: 484704,
      diffRatio: 0.2,
      sizeMismatch: true,
      missingComparison: true,
    },
  ],
  totals: {
    diffPixels: 98140,
    totalPixels: 1454112,
    diffRatio: 0.0675,
    pagesWithChanges: 2,
    durationMs: 842,
    processedAt: 1752300000000,
  },
  warnings: [],
  settings: {
    dpi: 150,
    threshold: 10,
  },
};

const meta = {
  title: "Tools/Compare/ComparePixelWorkbenchView",
  component: ComparePixelWorkbenchView,
} satisfies Meta<typeof ComparePixelWorkbenchView>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    result: baseResult,
  },
};

export const NoDifferences: Story = {
  args: {
    result: {
      ...baseResult,
      pages: baseResult.pages.map((page) => ({
        ...page,
        diffPixels: 0,
        diffRatio: 0,
        sizeMismatch: false,
        missingBase: undefined,
        missingComparison: undefined,
      })),
      totals: {
        ...baseResult.totals,
        diffPixels: 0,
        diffRatio: 0,
        pagesWithChanges: 0,
      },
    },
  },
};

export const WithWarnings: Story = {
  args: {
    result: {
      ...baseResult,
      warnings: [
        "Page 3 could not be rendered at the requested DPI and was downscaled.",
      ],
    },
  },
};
