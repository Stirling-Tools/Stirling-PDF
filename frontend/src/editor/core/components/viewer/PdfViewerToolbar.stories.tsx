import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import { userEvent, within } from "storybook/test";
import { PdfViewerToolbar } from "@editor/components/viewer/PdfViewerToolbar";
import {
  ViewerBarButtons,
  ViewerStoryProviders,
  type StoryDocument,
} from "@editor/components/viewer/viewerStoryProviders";

/** The bottom dock, at a given width, with the viewer's page tools registered. */
function dock(width: string, doc: StoryDocument = {}) {
  return (Story: () => ReactElement) => (
    <ViewerStoryProviders doc={{ currentPage: 3, ...doc }}>
      <ViewerBarButtons />
      <div
        className="pdf-viewer-toolbar-dock"
        style={{
          width,
          display: "flex",
          justifyContent: "center",
          paddingTop: "14rem",
        }}
      >
        <Story />
      </div>
    </ViewerStoryProviders>
  );
}

const meta = {
  title: "Viewer/PdfViewerToolbar",
  component: PdfViewerToolbar,
  args: { currentPage: 3, totalPages: 12 },
} satisfies Meta<typeof PdfViewerToolbar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A fixed zoom: reset returns to the default fit. */
export const Wide: Story = {
  decorators: [dock("60rem", { zoomPercent: 125, zoomLevel: 1.25 })],
};

/** Already at the default fit, so there is nothing to reset. */
export const FitToWidth: Story = {
  decorators: [
    dock("60rem", { zoomPercent: 87, zoomLevel: ZoomMode.FitWidth }),
  ],
};

/** Pan, ruler and read aloud fold into a Tools menu. */
export const Narrow: Story = {
  decorators: [dock("40rem")],
};

export const NarrowToolsOpen: Story = {
  decorators: [dock("40rem")],
  parameters: {
    // Mantine puts a focus placeholder div inside every open menu.
    a11y: {
      config: { rules: [{ id: "aria-required-children", enabled: false }] },
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByTestId("viewer-page-tools-menu"),
    );
  },
};

/** The fewest controls: page arrows and the wide-only buttons drop away. */
export const Narrowest: Story = {
  decorators: [dock("30rem")],
};
