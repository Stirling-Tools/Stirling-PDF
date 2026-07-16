import type { Meta, StoryObj } from "@storybook/react-vite";
import CompareDocumentPane from "@app/components/tools/compare/CompareDocumentPane";
import type { PagePreview } from "@app/types/compare";

// 1x1 transparent PNG so the pane's <img> resolves without a network request.
const PLACEHOLDER_PAGE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const buildPages = (count: number): PagePreview[] =>
  Array.from({ length: count }, (_, index) => ({
    pageNumber: index + 1,
    width: 612,
    height: 792,
    rotation: 0,
    url: PLACEHOLDER_PAGE_IMAGE,
  }));

const meta = {
  title: "Tools/Compare/CompareDocumentPane",
  component: CompareDocumentPane,
  args: {
    pane: "base",
    layout: "side-by-side",
    scrollRef: { current: null },
    peerScrollRef: { current: null },
    handleScrollSync: () => {},
    handleWheelZoom: () => {},
    handleWheelOverscroll: () => {},
    onTouchStart: () => {},
    onTouchMove: () => {},
    onTouchEnd: () => {},
    isPanMode: false,
    zoom: 1,
    title: "original-document.pdf",
    changes: [
      { value: "change-1", label: "Paragraph 1 change", pageNumber: 1 },
      { value: "change-2", label: "Paragraph 2 change", pageNumber: 2 },
    ],
    onNavigateChange: () => {},
    isLoading: false,
    processingMessage: "Processing...",
    pages: buildPages(2),
    pairedPages: buildPages(2),
    getRowHeightPx: () => 792,
    wordHighlightMap: new Map(),
    metaIndexToGroupId: new Map(),
    documentLabel: "Original",
    pageLabel: "Page",
    altLabel: "Document page preview",
  },
} satisfies Meta<typeof CompareDocumentPane>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    isLoading: true,
    pages: [],
    pairedPages: [],
  },
};

export const NoChanges: Story = {
  args: {
    changes: [],
    dropdownPlaceholder: "No changes",
  },
};
