/**
 * The floating toolbar under the document: page navigation, spread mode, the
 * colour filter and zoom.
 *
 * Its props are near-vestigial — everything on show comes from the viewer
 * context's bridge state. The page position decides which of the four
 * navigation buttons are disabled (you cannot go back from page one, or forward
 * from the last), a single-page document also locks the spread toggle, and
 * `pdfRenderMode` cycles normal → dark → sepia, changing both the icon and
 * whether the button reads as active. Rather than stand up the EmbedPDF
 * pipeline behind those bridges, these stories supply the slice of context the
 * toolbar reads.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ViewerContext,
  type ViewerContextType,
} from "@app/contexts/ViewerContext";
import { PdfViewerToolbar } from "@app/components/viewer/PdfViewerToolbar";

interface ToolbarState {
  currentPage: number;
  totalPages: number;
  zoomPercent?: number;
  isDualPage?: boolean;
  pdfRenderMode?: "normal" | "dark" | "sepia";
}

function viewerValue({
  currentPage,
  totalPages,
  zoomPercent = 140,
  isDualPage = false,
  pdfRenderMode = "normal",
}: ToolbarState): ViewerContextType {
  // The toolbar mirrors bridge state into local state through these
  // registrations; returning a no-op unregister is all a story needs.
  const noopRegister = () => () => {};

  return {
    getScrollState: () => ({ currentPage, totalPages }),
    getZoomState: () => ({ currentZoom: zoomPercent / 100, zoomPercent }),
    getSpreadState: () => ({
      spreadMode: isDualPage ? "odd" : "none",
      isDualPage,
    }),
    scrollActions: {
      scrollToPage: () => {},
      scrollToFirstPage: () => {},
      scrollToLastPage: () => {},
    },
    zoomActions: {
      zoomIn: () => {},
      zoomOut: () => {},
      setZoomLevel: () => {},
    },
    spreadActions: { toggleSpreadMode: () => {} },
    registerImmediateScrollUpdate: noopRegister,
    registerImmediateZoomUpdate: noopRegister,
    registerImmediateSpreadUpdate: noopRegister,
    pdfRenderMode,
    cyclePdfRenderMode: () => {},
  } as unknown as ViewerContextType;
}

const withViewer = (state: ToolbarState) => (Story: React.ComponentType) => (
  <ViewerContext.Provider value={viewerValue(state)}>
    <Story />
  </ViewerContext.Provider>
);

const meta: Meta<typeof PdfViewerToolbar> = {
  title: "Viewer/PdfViewerToolbar",
  component: PdfViewerToolbar,
  parameters: { layout: "centered" },
  decorators: [withViewer({ currentPage: 5, totalPages: 12 })],
};
export default meta;

type Story = StoryObj<typeof PdfViewerToolbar>;

/** Part-way through a document: every control is live. */
export const Default: Story = {};

/** On page one, so both backward controls are disabled. */
export const FirstPage: Story = {
  decorators: [withViewer({ currentPage: 1, totalPages: 12 })],
};

/** On the last page, so both forward controls are disabled. */
export const LastPage: Story = {
  decorators: [withViewer({ currentPage: 12, totalPages: 12 })],
};

/** A one-page document: navigation and the spread toggle have nowhere to go. */
export const SinglePageDocument: Story = {
  decorators: [withViewer({ currentPage: 1, totalPages: 1 })],
};

/** Two-up reading — the toggle is active and offers the way back. */
export const DualPageSpread: Story = {
  decorators: [
    withViewer({ currentPage: 5, totalPages: 12, isDualPage: true }),
  ],
};

/** The dark colour filter is on; the button now offers sepia next. */
export const DarkFilter: Story = {
  decorators: [
    withViewer({ currentPage: 5, totalPages: 12, pdfRenderMode: "dark" }),
  ],
};

/** Sepia is the last step of the cycle, so the button offers to clear it. */
export const SepiaFilter: Story = {
  decorators: [
    withViewer({ currentPage: 5, totalPages: 12, pdfRenderMode: "sepia" }),
  ],
};

/** Zoomed well in: the slider sits near its ceiling and the readout follows. */
export const ZoomedIn: Story = {
  decorators: [
    withViewer({ currentPage: 5, totalPages: 12, zoomPercent: 320 }),
  ],
};
