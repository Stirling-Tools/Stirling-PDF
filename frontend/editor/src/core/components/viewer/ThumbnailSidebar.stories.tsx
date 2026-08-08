import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ViewerContext,
  type ViewerContextType,
} from "@app/contexts/ViewerContext";
import { ThumbnailSidebar } from "@app/components/viewer/ThumbnailSidebar";

/**
 * The viewer's page rail. Each thumbnail jumps the viewer to that page, so
 * they are controls rather than pictures — `aria-current` marks the page being
 * viewed, which the highlight alone only conveys visually.
 *
 * The sidebar reads the viewer context for page counts and thumbnail
 * rendering. Rather than standing up a ViewerProvider (and the document
 * pipeline behind it), these stories supply the small slice of context the
 * sidebar actually touches.
 */
function viewerValue(
  currentPage: number,
  totalPages: number,
): ViewerContextType {
  return {
    getScrollState: () => ({ currentPage, totalPages }),
    scrollActions: { scrollToPage: () => {} },
    // No renderer in a story, so no thumbnail images — the page frames,
    // numbering and selected state are what these stories are for.
    getThumbnailAPI: () => null,
  } as unknown as ViewerContextType;
}

const withViewer =
  (currentPage: number, totalPages: number) => (Story: React.ComponentType) => (
    <ViewerContext.Provider value={viewerValue(currentPage, totalPages)}>
      <div style={{ height: "80vh", display: "flex" }}>
        <Story />
      </div>
    </ViewerContext.Provider>
  );

const meta: Meta<typeof ThumbnailSidebar> = {
  title: "Viewer/ThumbnailSidebar",
  component: ThumbnailSidebar,
  parameters: { layout: "fullscreen" },
  args: { visible: true, onToggle: () => {}, activeFileId: "file-1" },
};
export default meta;

type Story = StoryObj<typeof ThumbnailSidebar>;

/** A short document, viewing page 1. */
export const Default: Story = {
  decorators: [withViewer(1, 8)],
};

/** Part-way through — the current page is marked, not just tinted. */
export const MidDocument: Story = {
  decorators: [withViewer(5, 8)],
};

/** A long document, so the rail scrolls. */
export const LongDocument: Story = {
  decorators: [withViewer(12, 120)],
};

/** A single-page document: the rail still lists it. */
export const SinglePage: Story = {
  decorators: [withViewer(1, 1)],
};

/** Nothing loaded yet — no pages to list. */
export const NoPages: Story = {
  decorators: [withViewer(0, 0)],
};

/** Collapsed. */
export const Hidden: Story = {
  args: { visible: false },
  decorators: [withViewer(1, 8)],
};
